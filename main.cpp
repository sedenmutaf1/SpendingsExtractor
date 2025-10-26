#include <iostream>
#include <fstream>
#include <regex>
#include <string>
#include <sstream>
#include <algorithm>
#include <cctype>

int main(int argc, char* argv[]) {
    
    if (argc != 4) {
       
        std::cerr << "Usage: " << argv[0] << " <input_file_path> <NAME> <SURNAME>" << std::endl;
        std::cerr << "Example: " << argv[0] << " \"../../statement.txt\" SEDEN MUTAF" << std::endl;
        return 1;
    }

    std::string inputFile = argv[1];
    std::string name = argv[2];
    std::string surname = argv[3];

    std::string outputFile = inputFile;
    size_t dotPos = outputFile.rfind('.');
    if (dotPos != std::string::npos) {
        outputFile.insert(dotPos, "_extracted");
    } else {
        outputFile += "_extracted.txt";
    }


    std::ifstream inFile(inputFile);
    if (!inFile.is_open()) {
        std::cerr << "Cannot open input file: " << inputFile << std::endl;
        return 1;
    }

    std::ofstream outFile(outputFile);
    if (!outFile.is_open()) {
        std::cerr << "Cannot open output file: " << outputFile << std::endl;
        return 1;
    }

    std::transform(name.begin(), name.end(), name.begin(), ::toupper);
    std::transform(surname.begin(), surname.end(), surname.begin(), ::toupper);

    std::string startCardRegexString = R"(\d{4}\*{8}\d{4}\s+)" + name + R"(\s+)" + surname;
    
   
    std::regex startCard(startCardRegexString); 
    std::regex otherCard(R"(\d{4}\*{8}\d{4}\s+\w+\s+\w+)"); 
    std::regex datePattern(R"(^\d{2}\.\d{2}\.\d{4})");  
    std::regex moneyPattern(R"((?:^|\s)([+-]?\d{1,3}(?:,\d{3})*\.\d{2})(?=\s|$))");

    bool inMySection = false;
    double total = 0.0;
    std::string line;

    while (std::getline(inFile, line)) {
        line.erase(0, line.find_first_not_of(" \t\r\n"));
        line.erase(line.find_last_not_of(" \t\r\n") + 1);

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

                    if (isReturn) {
                        total -= value; 
                        outFile << line << " -> -" << value << " (Return)" << std::endl;
                    } else {
                        total += value; 
                        outFile << line << " -> " << value << std::endl;
                    }

                } catch (...) {
                    
                }

                found = true; 
            }
        }
    }

    inFile.close();
    outFile.close();

    std::cout << "Total spending: " << total << std::endl;
    std::cout << "Extracted lines written to: " << outputFile << std::endl;

    return 0;
}