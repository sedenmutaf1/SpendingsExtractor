// parser.cpp
// Poppler C++ API PDF parser that extracts transactions and outputs JSON to STDOUT.
// - Groups transactions by user (name + masked card)
// - Detects main user from "Sayın <NAME>" + "Kart No : <masked>"
// - Detects side users from "<masked> <NAME>" header lines
// - Robustly parses installment lines by extracting NxAmount first (e.g., 2x633.50)
// - Parses the amount column correctly even when description contains numbers
//
// Build (MSYS2 MinGW64):
//   g++ -std=c++17 parser.cpp $(pkgconf --cflags --libs poppler-cpp) -o parser.exe
//
// Run:
//   ./parser.exe "statement.pdf" > out.json
//
// IMPORTANT:
// - This program prints ONLY JSON to stdout.
// - All logs/errors go to stderr.

#include <poppler/cpp/poppler-document.h>
#include <poppler/cpp/poppler-page.h>

#include <algorithm>
#include <cctype>
#include <iostream>
#include <memory>
#include <regex>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>

// -----------------------------
// Data structures
// -----------------------------
struct InstallmentInfo {
    bool has = false;
    bool is_last = false;          // "Son Taksit"
    std::string plan_text;         // e.g. "2x633.50" or "Son Taksit"
    int count = -1;
    double per_amount = 0.0;
};

struct Txn {
    std::string date;              // dd.mm.yyyy
    std::string description;
    double amount = 0.0;           // absolute value
    std::string sign;              // "debit" or "credit"
    InstallmentInfo installment;
    int page = -1;                 // 1-based
    int line = -1;                 // 1-based
};

struct UserBucket {
    std::string name;
    std::string card;              // masked: 5400********9509
    bool is_main = false;
    std::vector<Txn> transactions;
};

// -----------------------------
// Helpers
// -----------------------------
static std::string to_string_utf8(const poppler::ustring& u) {
    // On your Poppler build, to_utf8() returns poppler::byte_array = std::vector<char>
    auto bytes = u.to_utf8();
    if (!bytes.empty() && bytes.back() == '\0') bytes.pop_back();
    return std::string(bytes.begin(), bytes.end());
}

static std::vector<std::string> split_lines(const std::string& s) {
    std::vector<std::string> lines;
    std::istringstream iss(s);
    std::string line;
    while (std::getline(iss, line)) {
        if (!line.empty() && line.back() == '\r') line.pop_back();
        lines.push_back(line);
    }
    return lines;
}

static std::string trim(std::string s) {
    auto is_ws = [](unsigned char c) { return std::isspace(c) != 0; };
    while (!s.empty() && is_ws((unsigned char)s.front())) s.erase(s.begin());
    while (!s.empty() && is_ws((unsigned char)s.back())) s.pop_back();
    return s;
}

static std::string collapse_ws(const std::string& s) {
    return std::regex_replace(s, std::regex(R"(\s+)"), " ");
}

static std::string json_escape(const std::string& s) {
    std::string out;
    out.reserve(s.size() + 16);
    for (unsigned char c : s) {
        switch (c) {
            case '\\': out += "\\\\"; break;
            case '"':  out += "\\\""; break;
            case '\b': out += "\\b"; break;
            case '\f': out += "\\f"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (c < 0x20) {
                    char buf[7];
                    std::snprintf(buf, sizeof(buf), "\\u%04x", c);
                    out += buf;
                } else {
                    out += (char)c;
                }
        }
    }
    return out;
}

// Parse amounts like:
// "1,360.00"   -> 1360.00  (comma thousands, dot decimal)
// "56,126.34"  -> 56126.34
// "225.00"     -> 225.00
// "+34,154.42" -> 34154.42 (sign handled separately)
static bool parse_amount(const std::string& raw, double& out) {
    std::string s = trim(raw);
    if (s.empty()) return false;

    // Remove leading sign (handled elsewhere)
    if (s.front() == '+' || s.front() == '-') s.erase(s.begin());
    s = trim(s);

    // If both ',' and '.' exist -> comma thousands, dot decimal -> remove commas
    if (s.find(',') != std::string::npos && s.find('.') != std::string::npos) {
        s.erase(std::remove(s.begin(), s.end(), ','), s.end());
    } else if (s.find(',') != std::string::npos && s.find('.') == std::string::npos) {
        // only comma -> treat as decimal separator
        std::replace(s.begin(), s.end(), ',', '.');
    }

    try {
        out = std::stod(s);
        return true;
    } catch (...) {
        return false;
    }
}

static void parse_installment_plan(InstallmentInfo& inst) {
    if (!inst.has) return;
    std::smatch m;
    static const std::regex re_plan(R"((\d+)\s*x\s*([0-9][0-9.,]*))", std::regex::icase);
    if (std::regex_search(inst.plan_text, m, re_plan)) {
        inst.count = std::stoi(m[1].str());
        double v = 0.0;
        if (parse_amount(m[2].str(), v)) inst.per_amount = v;
    }
}

static std::string user_key(const std::string& card, const std::string& name) {
    return card + "|" + name;
}

// Find last "money-like" token (contains '.' or ',' and has 2 digits after last separator)
// This avoids grabbing numbers in "6. Taksit" or "8 E".
static bool find_last_amount_token(const std::string& s, size_t& pos, size_t& len, std::string& token) {
    static const std::regex re_num(R"([+-]?\d[\d.,]*)");
    std::vector<std::smatch> matches;
    for (std::sregex_iterator it(s.begin(), s.end(), re_num), end; it != end; ++it) {
        matches.push_back(*it);
    }
    if (matches.empty()) return false;

    for (int i = (int)matches.size() - 1; i >= 0; --i) {
        std::string t = matches[i].str();

        auto dot = t.find('.');
        auto comma = t.find(',');
        bool has_sep = (dot != std::string::npos) || (comma != std::string::npos);
        if (!has_sep) continue;

        size_t last_sep = std::max(dot == std::string::npos ? 0 : dot,
                                  comma == std::string::npos ? 0 : comma);
        if (last_sep == 0) continue;

        if (last_sep + 2 < t.size()) {
            char a = t[last_sep + 1];
            char b = t[last_sep + 2];
            if (std::isdigit((unsigned char)a) && std::isdigit((unsigned char)b)) {
                pos = (size_t)matches[i].position();
                len = (size_t)matches[i].length();
                token = t;
                return true;
            }
        } else {
            pos = (size_t)matches[i].position();
            len = (size_t)matches[i].length();
            token = t;
            return true;
        }
    }

    // Fallback: last numeric token
    pos = (size_t)matches.back().position();
    len = (size_t)matches.back().length();
    token = matches.back().str();
    return true;
}

// -----------------------------
// Main
// -----------------------------
int main(int argc, char** argv) {
    if (argc < 2) {
        std::cerr << "Usage: parser <input.pdf>\n";
        return 1;
    }

    const std::string pdfPath = argv[1];

    std::unique_ptr<poppler::document> doc(poppler::document::load_from_file(pdfPath));
    if (!doc) {
        std::cerr << "Error: failed to open PDF: " << pdfPath << "\n";
        return 2;
    }
    if (doc->is_locked()) {
        std::cerr << "Error: PDF is locked/password-protected.\n";
        return 3;
    }

    // Patterns for your statement format
    const std::regex re_main_name(R"(Sayın\s+([A-ZÇĞİÖŞÜIİ\s]+))");
    const std::regex re_main_card(R"(Kart\s*No\s*:\s*([0-9]{4}\*+[0-9]{4}))");
    const std::regex re_side_header(R"(^\s*([0-9]{4}\*+[0-9]{4})\s+(.+?)\s*$)");
    const std::regex re_date_line(R"(^\s*(\d{2}\.\d{2}\.\d{4})\s+(.*)$)");
    const std::regex re_plan_any(R"(\b\d+\s*x\s*[0-9][0-9.,]*\b)", std::regex::icase);

    std::string main_name, main_card;
    bool main_user_ready = false;

    // Current active user while scanning
    std::string cur_name, cur_card;

    std::unordered_map<std::string, UserBucket> users;
    std::vector<Txn> unassigned;

    const int totalPages = doc->pages();
    for (int p = 0; p < totalPages; ++p) {
        std::unique_ptr<poppler::page> page(doc->create_page(p));
        if (!page) continue;

        std::string pageText = to_string_utf8(page->text());
        auto lines = split_lines(pageText);

        for (int li = 0; li < (int)lines.size(); ++li) {
            std::string line = collapse_ws(trim(lines[li]));
            if (line.empty()) continue;

            // Detect main name
            {
                std::smatch m;
                if (std::regex_search(line, m, re_main_name)) {
                    main_name = trim(m[1].str());
                    if (!main_card.empty()) {
                        main_user_ready = true;
                        cur_name = main_name;
                        cur_card = main_card;
                        auto k = user_key(cur_card, cur_name);
                        if (users.find(k) == users.end()) users.emplace(k, UserBucket{cur_name, cur_card, true, {}});
                        else users[k].is_main = true;
                    }
                    continue;
                }
            }

            // Detect main card
            {
                std::smatch m;
                if (std::regex_search(line, m, re_main_card)) {
                    main_card = trim(m[1].str());
                    if (!main_name.empty()) {
                        main_user_ready = true;
                        cur_name = main_name;
                        cur_card = main_card;
                        auto k = user_key(cur_card, cur_name);
                        if (users.find(k) == users.end()) users.emplace(k, UserBucket{cur_name, cur_card, true, {}});
                        else users[k].is_main = true;
                    }
                    continue;
                }
            }

            // Detect side user header: "<masked> <NAME>"
            {
                std::smatch m;
                if (std::regex_match(line, m, re_side_header)) {
                    std::string card = trim(m[1].str());
                    std::string name = trim(m[2].str());

                    // Heuristic: ignore header fields with ':'
                    if (name.find(':') == std::string::npos) {
                        cur_card = card;
                        cur_name = name;
                        auto k = user_key(cur_card, cur_name);
                        if (users.find(k) == users.end()) users.emplace(k, UserBucket{cur_name, cur_card, false, {}});
                        continue;
                    }
                }
            }

            // Transaction line: "<date> <rest...>"
            std::smatch md;
            if (!std::regex_match(line, md, re_date_line)) continue;

            std::string date = md[1].str();
            std::string rest = trim(md[2].str());
            if (rest.empty()) continue;

            Txn tx;
            tx.page = p + 1;
            tx.line = li + 1;
            tx.date = date;

            // 1) Extract installment plan FIRST (NxAmount), remove it from the line
            InstallmentInfo inst;
            {
                std::smatch mp;
                if (std::regex_search(rest, mp, re_plan_any)) {
                    inst.has = true;
                    inst.plan_text = mp[0].str();
                    parse_installment_plan(inst);

                    rest.erase((size_t)mp.position(0), (size_t)mp.length(0));
                    rest = collapse_ws(trim(rest));
                }
            }

            // 2) Find last money-like token as the actual amount column
            size_t apos = 0, alen = 0;
            std::string amountTok;
            if (!find_last_amount_token(rest, apos, alen, amountTok)) continue;

            std::string before = trim(rest.substr(0, apos));        // description
            std::string after  = trim(rest.substr(apos + alen));    // tail (may contain "Son Taksit")

            if (before.empty()) continue;

            // Mark last installment if it appears after the amount
            if (!after.empty()) {
                if (after.find("Son Taksit") != std::string::npos || after.find("SON TAKSIT") != std::string::npos) {
                    inst.has = true;
                    inst.is_last = true;
                    if (inst.plan_text.empty()) inst.plan_text = "Son Taksit";
                }
            }

            tx.description = before;

            bool is_credit = (!amountTok.empty() && amountTok.front() == '+');
            tx.sign = is_credit ? "credit" : "debit";

            double v = 0.0;
            if (!parse_amount(amountTok, v)) continue;
            tx.amount = v;

            if (inst.has) tx.installment = inst;

            // Assign transaction to current user, else fallback to main, else unassigned
            if (!cur_card.empty() && !cur_name.empty()) {
                auto k = user_key(cur_card, cur_name);
                auto it = users.find(k);
                if (it == users.end()) {
                    users.emplace(k, UserBucket{cur_name, cur_card, false, {}});
                    it = users.find(k);
                }
                it->second.transactions.push_back(std::move(tx));
            } else if (main_user_ready) {
                auto k = user_key(main_card, main_name);
                if (users.find(k) == users.end()) users.emplace(k, UserBucket{main_name, main_card, true, {}});
                else users[k].is_main = true;
                users[k].transactions.push_back(std::move(tx));
            } else {
                unassigned.push_back(std::move(tx));
            }
        }
    }

    // -----------------------------
    // Output JSON to stdout ONLY
    // -----------------------------
    std::cout << "{\n";
    std::cout << "  \"source\": {\"pdf\": \"" << json_escape(pdfPath) << "\", \"pages\": " << totalPages << "},\n";

    std::cout << "  \"users\": [\n";
    bool firstUser = true;
    for (auto& kv : users) {
        UserBucket& u = kv.second;
        if (!firstUser) std::cout << ",\n";
        firstUser = false;

        std::cout << "    {\n";
        std::cout << "      \"name\": \"" << json_escape(u.name) << "\",\n";
        std::cout << "      \"card\": \"" << json_escape(u.card) << "\",\n";
        std::cout << "      \"is_main\": " << (u.is_main ? "true" : "false") << ",\n";
        std::cout << "      \"transactions\": [\n";

        for (size_t i = 0; i < u.transactions.size(); ++i) {
            const Txn& t = u.transactions[i];
            std::cout << "        {\n";
            std::cout << "          \"date\": \"" << json_escape(t.date) << "\",\n";
            std::cout << "          \"description\": \"" << json_escape(t.description) << "\",\n";
            std::cout << "          \"sign\": \"" << t.sign << "\",\n";
            std::cout << "          \"amount\": " << t.amount << ",\n";

            if (t.installment.has) {
                std::cout << "          \"installment\": {\n";
                std::cout << "            \"is_last\": " << (t.installment.is_last ? "true" : "false") << ",\n";
                std::cout << "            \"plan_text\": \"" << json_escape(t.installment.plan_text) << "\"";
                if (t.installment.count > 0) {
                    std::cout << ",\n            \"count\": " << t.installment.count
                              << ",\n            \"per_amount\": " << t.installment.per_amount << "\n";
                    std::cout << "          }\n";
                } else {
                    std::cout << "\n          }\n";
                }
            } else {
                std::cout << "          \"installment\": null\n";
            }

            std::cout << "        }" << (i + 1 < u.transactions.size() ? "," : "") << "\n";
        }

        std::cout << "      ]\n";
        std::cout << "    }";
    }
    std::cout << "\n  ],\n";

    std::cout << "  \"unassigned\": [\n";
    for (size_t i = 0; i < unassigned.size(); ++i) {
        const Txn& t = unassigned[i];
        std::cout << "    {\n";
        std::cout << "      \"date\": \"" << json_escape(t.date) << "\",\n";
        std::cout << "      \"description\": \"" << json_escape(t.description) << "\",\n";
        std::cout << "      \"sign\": \"" << t.sign << "\",\n";
        std::cout << "      \"amount\": " << t.amount << ",\n";
        std::cout << "      \"page\": " << t.page << ",\n";
        std::cout << "      \"line\": " << t.line << "\n";
        std::cout << "    }" << (i + 1 < unassigned.size() ? "," : "") << "\n";
    }
    std::cout << "  ]\n";
    std::cout << "}\n";

    return 0;
}
