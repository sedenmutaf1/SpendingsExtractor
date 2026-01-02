
# Spendings Extractor – Desktop App

Spendings Extractor is a desktop application designed to help users analyze and organize their personal spending. It combines a PDF parser with an interactive GUI built with Electron to make financial tracking intuitive and visual.

## How It Works

1. **Input Personal Data & PDF**
   On launch, the app asks for the user's name, surname, and a PDF containing payment data. The embedded parser script processes the PDF to extract all payments automatically.

2. **Payments Display & Categorization**
   Extracted payments are displayed in a table-like interface. Users can create custom categories and drag-and-drop payments into them. Payments can be moved back to the main list or between categories. Subtotals are displayed for each category, and users can zoom in on a category for a closer view.

## Key Features

* **PDF Parsing:** Automatically extract payments from user-provided PDFs.
* **Dynamic Categorization:** Create, edit, and manage categories interactively.
* **Drag-and-Drop Functionality:** Move payments between categories or back to the main list.
* **Subtotals & Zoom:** View category totals and inspect individual categories in detail via a zoom feature.
* **Intuitive UI:** Clean, responsive, and Excel-like interface for easy navigation.

## Upcoming Milestones

* **Save & Load Categories:** Users will be able to save their current categorization and reload it later.
* **Spending Charts:** Automatically generate visualizations to display spending habits by category.
* **Overall Assessments:** Save overall categorization and generate monthly summaries and insights.
* **AI-Assisted Categorization:** Integrate AI to automate categorization based on payment patterns.

Spendings Extractor aims to make personal finance tracking simple, visual, and actionable, helping users understand and manage their spending more effectively.

## Installation

For installation, open the /gui/dist/ directory and run the "Spendings Extractor Setup 1.0.0.exe" setup file.

## Notes
Unfortunately, right now the app works with text files, not PDF. You must open the PDF and copy everything, then paste to a text file and it will work.

App only works on Windows environment.
