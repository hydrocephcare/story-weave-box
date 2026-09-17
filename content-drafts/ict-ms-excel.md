# MS Excel — HIT100 Course Notes

*Course notes for the Microsoft Excel section of HIT100 Information Technology, University of Nairobi. Covers the Excel user interface, entering and managing data, formatting, formulas and functions, multiple workbooks, macros, reports, and sharing worksheets.*

## Course Description

In this course you will automate some common Excel tasks, apply advanced analysis techniques to more complex data sets, collaborate on worksheets with others, and share Excel data with other applications.

Upon completion, students will be able to:

- Customize workbooks.
- Collaborate with others using workbooks.
- Audit worksheets.
- Analyze data.
- Work with multiple workbooks.
- Import and export data.

## Working with the User Interface

- **Introducing the Ribbon user interface** — the Ribbon organises Excel's commands into tabs (File, Home, Insert, Page Layout, Formulas, Data, Review, View).
- **Introducing workbooks and worksheets** — a workbook is the Excel file; each workbook contains one or more worksheets (tabs) made up of cells in rows and columns.
- **Introducing the Formula Bar** — the bar above the grid that shows the contents of the selected cell and is used to enter or edit formulas.
- **Customizing the user interface** — adding commands to the Quick Access Toolbar and customising the Ribbon.

## Entering & Managing Data

- **Getting data into Excel** — typing directly into cells or importing data from other sources.
- **Managing rows and columns** — inserting, deleting, hiding and resizing rows and columns.
- **Finding data** — searching for values within the worksheet.
- **Matching case and entire cell contents** — making searches exact.
- **Replacing data** — find-and-replace across a worksheet.
- **Finding and replacing empty values**.
- **Sorting data** and **sorting multiple columns** — arranging records into a meaningful order.
- **Filtering data** — displaying only the rows that meet a condition.

## Using Formatting Techniques

- **Formatting numbers and dates** — currency, percentages, decimal places, date formats.
- **Formatting cells** — the Format Cells dialog box.
- **Setting the font type, colour and size**.
- **Using borders and cell styles**.
- **Adding shapes and pictures**.
- **Creating WordArt**.

## Formula Basics

- **Constants, formulas and cell references** — a formula begins with `=`, e.g. `=A1+B2`.
- **Understanding the order of operations** — Excel follows BODMAS/BIDMAS rules (brackets, exponents, division/multiplication, addition/subtraction).
- **Linking cells and using comparison operators** — `=`, `>`, `<`, `>=`, `<=`, `<>`.
- **Creating an absolute reference** — using `$` signs (e.g. `$A$1`) to lock a cell reference so it does not change when copied.
- **Defining named ranges** — giving a cell or range a meaningful name to use in formulas.
- **Exploring the function library** — the hundreds of built-in functions organised by category.
- **Using the AutoSum function** — quickly summing a row or column with `=SUM()`.

## Working with Multiple Workbooks

- **Creating a workspace** — saving a collection of open workbooks.
- **Consolidating data** — combining data from several worksheets into one.
- **Linking cells in different workbooks** — formulas that reference cells in another workbook.
- **Editing links** — updating, changing or breaking workbook links.

## Useful Functions

- **Using logical functions** — functions such as `IF`, `AND`, `OR`, `NOT` and `IFERROR` that test conditions and return results. The **IF function** works as: `=IF(condition, value_if_true, value_if_false)`.
- **Using the AND and OR functions** — `=AND()` returns TRUE only if all conditions are true; `=OR()` returns TRUE if at least one condition is true.
- **Using COUNT functions** — `COUNT`, `COUNTA`, `COUNTBLANK`, `COUNTIF` and `COUNTIFS` for counting cells.
- **Using the VLOOKUP function** — looks up a value in the first column of a table and returns a value from a column to the right: `=VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])`.
- **Using the HLOOKUP function** — like VLOOKUP but searches across the first *row* of a table instead of the first column.

## Streamlining Workflow

- **Creating a macro** — recording a series of actions that can be replayed with a single command.
- **Editing a macro** — modifying recorded code in the Visual Basic Editor.
- **Customizing access to Excel commands** — adding macro buttons to the Quick Access Toolbar.
- **Applying conditional formatting** — formatting cells automatically based on their values.
- **Adding data validation criteria** — restricting what can be typed into a cell (e.g. a dropdown list or a value range).
- **Modifying Excel's default settings** — Excel Options for preferences.

## Creating Reports

- **Creating a subtotal report** — automatic subtotals for grouped data.
- **Using conditional formatting** — highlighting trends, e.g. colour scales, data bars and icon sets.
- **Creating and managing conditions**.
- **Creating a chart** and **refining charts** — titles, legends, axis labels.
- **Using basic chart types** — column, bar, line, pie, scatter and area charts.

## Sharing & Distributing Your Work

- **Inserting headers and footers** — text repeated at the top or bottom of every printed page.
- **Adding comments** — notes attached to cells for collaboration.
- **Adjusting page layout** — margins, orientation, print area, page breaks.
- **Distributing your worksheets** — sharing, emailing and protecting workbooks.
- **Protecting your worksheets** — locking cells and setting passwords.

## Importing and Exporting Data

- **Exporting to Microsoft Word** — copying data, tables and charts into Word documents.
- **Importing a Word table** — bringing a table from Word into Excel.
- **Importing text files** — loading comma-separated (CSV) or tab-delimited data into a worksheet.

## Analyzing Data

- **Performing what-if analysis** — using tools such as Scenario Manager, Goal Seek and Data Tables to explore how changes to inputs affect formula results.

## Key Functions for Exams

Examiners frequently test the **IF**, **AND**, **OR**, **VLOOKUP** and **HLOOKUP** functions, together with **absolute references** and **what-if analysis**. Be ready to explain how the IF function evaluates a condition and returns a value, and to construct nested logical formulas.
