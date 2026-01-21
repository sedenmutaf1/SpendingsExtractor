#include <iostream>
#include <fstream>
#include <regex>
#include <string>
#include <sstream>
#include <algorithm>
#include <cctype>
#include <vector>
#include <iomanip> // for fixed and setprecision

struct Payment {
    std::string date;
    std::string description;
    double amount;
};

// Escape strings for JSON output
std::string escapeJson(const std::string& s) {
    std::ostringstream o;
    for (auto c : s) {
        switch (c) {
            case '"': o << "\\\""; break;
            case '\\': o << "\\\\"; break;
            case '\b': o << "\\b"; break;
            case '\f': o << "\\f"; break;
            case '\n': o << "\\n"; break;
            case '\r': o << "\\r"; break;
            case '\t': o << "\\t"; break;
            default:
                if ('\x00' <= c && c <= '\x1f') {
                    o << "\\u" << std::hex << std::setw(4) << std::setfill('0') << (int)c;
                } else {
                    o << c;
                }
        }
    }
    return o.str();
}

int main(int argc, char* argv[]) {
    if (argc != 4) {
        std::cerr << "Usage: " << argv[0] << " <input_file_path> <NAME> <SURNAME>" << std::endl;
        return 1;
    }

    std::string inputFile = argv[1];
    std::string name = argv[2];
    std::string surname = argv[3];

    // Open input file in binary mode to preserve UTF-8 characters
    std::ifstream inFile(inputFile, std::ios::binary);
    if (!inFile.is_open()) {
        std::cerr << "Cannot open input file: " << inputFile << std::endl;
        return 1;
    }

    // Uppercase the name/surname for matching
    std::transform(name.begin(), name.end(), name.begin(),
                   [](unsigned char c){ return std::toupper(c); });
    std::transform(surname.begin(), surname.end(), surname.begin(),
                   [](unsigned char c){ return std::toupper(c); });

    std::string startCardRegexString = R"(\d{4}\*{8}\d{4}\s+)" + name + R"(\s+)" + surname;
    std::regex startCard(startCardRegexString);
    std::regex otherCard(R"(\d{4}\*{8}\d{4}\s+\w+\s+\w+)");
    std::regex datePattern(R"(^\d{2}\.\d{2}\.\d{4})");
    std::regex moneyPattern(R"((?:^|\s)([+-]?\d{1,3}(?:,\d{3})*\.\d{2})(?=\s|$))");

    bool inMySection = false;
    double total = 0.0;
    std::string line;
    std::vector<Payment> payments;

    while (std::getline(inFile, line)) {
        // Preserve UTF-8: trim spaces manually
        size_t first = line.find_first_not_of(" \t\r\n");
        size_t last = line.find_last_not_of(" \t\r\n");
        if (first == std::string::npos) continue;
        line = line.substr(first, last - first + 1);

        if (std::regex_search(line, startCard)) {
            inMySection = true;
            continue;
        }

        if (inMySection && std::regex_search(line, otherCard) &&
            !std::regex_search(line, startCard)) {
            inMySection = false;
            continue;
        }

        if (inMySection && std::regex_search(line, datePattern)) {
            std::sregex_iterator it(line.begin(), line.end(), moneyPattern);
            std::sregex_iterator end;

            bool found = false;
            for (; it != end && !found; ++it) {
                std::string num = it->str(1);
                bool isReturn = (num.rfind('+', 0) == 0);
                num.erase(std::remove(num.begin(), num.end(), ','), num.end());

                try {
                    double value = std::stod(num);
                    if (isReturn) value = -value;
                    total += value;

                    // Extract date
                    std::string date, desc;
                    std::smatch m;
                    if (std::regex_search(line, m, datePattern)) {
                        date = m.str(0);
                        desc = line.substr(date.length());
                        // Remove the amount from the description
                        desc = std::regex_replace(desc, moneyPattern, "");
                        // Trim leading spaces
                        while (!desc.empty() && std::isspace(static_cast<unsigned char>(desc[0]))) desc.erase(0, 1);
                    }

                    payments.push_back({date, desc, value});
                } catch (...) {
                    // ignore parsing errors
                }

                found = true;
            }
        }
    }

    inFile.close();

    // Output JSON with UTF-8 support
    std::cout << std::fixed << std::setprecision(2);
    std::cout << "{\n";
    std::cout << "  \"total\": " << total << ",\n";
    std::cout << "  \"payments\": [\n";
    for (size_t i = 0; i < payments.size(); ++i) {
        const Payment& p = payments[i];
        std::cout << "    {\n";
        std::cout << "      \"date\": \"" << escapeJson(p.date) << "\",\n";
        std::cout << "      \"description\": \"" << escapeJson(p.description) << "\",\n";
        std::cout << "      \"amount\": " << p.amount << "\n";
        std::cout << "    }" << (i + 1 < payments.size() ? "," : "") << "\n";
    }
    std::cout << "  ]\n";
    std::cout << "}\n";

    return 0;
}
