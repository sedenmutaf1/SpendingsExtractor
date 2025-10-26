# Spend Extractor

This is a simple tool to read your PDF credit card statement, find your spending, and add it all up.

It finds all the charges and refunds for your specific card and saves them to a new `_extracted.txt` file.

## How to Use

1.  **Compile the code:**
    ```sh
    g++ parser.cpp -o parser -std=c++17
    ```

2.  **Run the program:**
    Pass the PDF file path, your first name, and your last name.
    ```sh
    ./parser "path/to/statement.pdf" "YOURNAME" "YOURSURNAME"
    ```

## Next Steps

This parser is just the first step. The plan is to build a full app where you can:

* See all your transactions in a clean list.
* Create your own spending categories (like "Food", "Transport", "Subscriptions").
* Drag and drop transactions into the categories.
* See charts that show you where your money went.
* (Later) Maybe add AI to categorize everything for you automatically.