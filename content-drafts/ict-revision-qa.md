# HIT100 ICT Revision Questions & Answers — Past Papers Compilation

*Revision questions and model answers compiled from University of Nairobi HIT100 Information Technology past examinations (2012–2021). Organised by topic to match the course syllabus. Use alongside the course notes for exam preparation.*

---

## Section 1: Computer Fundamentals & Operating Systems

### Q1. What do you understand by the term "operating system"? [2 marks]

**Answer:** An operating system (OS) is system software that manages a computer's hardware and software resources and provides common services for application programs. It acts as an intermediary between the user and the computer hardware, controlling the execution of programs, managing memory, handling input/output operations, and providing a user interface (GUI or command line). Examples include Windows, macOS and Linux.

### Q2. State THREE functions of an operating system. [3 marks]

**Answer:**

1. **Memory management** — the OS allocates and deallocates RAM to processes, tracks which parts of memory are in use, and reclaims memory when programs close.
2. **File management** — the OS organises data into files and directories, controls access permissions, and manages reading from and writing to storage devices.
3. **Process management** — the OS schedules which programs get CPU time, handles multitasking (running several programs at once), and manages process creation, execution and termination.

Other valid answers include: device management (controlling peripherals via drivers), security and access control, and providing a user interface.

### Q3. Draw the functional block diagram of a computer system. [6 marks]

**Answer:** A functional block diagram shows the major components and how data flows between them:

```
        ┌─────────────────────────────────┐
        │           INPUT DEVICES          │
        │  (Keyboard, Mouse, Scanner,     │
        │   Microphone)                    │
        └──────────────┬──────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────┐
        │       CENTRAL PROCESSING         │
        │            UNIT (CPU)            │
        │  ┌───────────┐ ┌──────────────┐  │
        │  │    ALU    │ │   Control    │  │
        │  │ (Arithmetic│ │   Unit (CU) │  │
        │  │  & Logic) │ │              │  │
        │  └───────────┘ └──────────────┘  │
        │  ┌──────────────────────────┐    │
        │  │     Registers / Cache    │    │
        │  └──────────────────────────┘    │
        └──────────────┬───────────────────┘
                       │
        ┌──────────────┼───────────────────┐
        │              │                   │
        ▼              ▼                   ▼
  ┌───────────┐  ┌───────────┐    ┌───────────────┐
  │  PRIMARY  │  │  SECONDARY│    │ OUTPUT DEVICES│
  │  MEMORY   │  │  MEMORY   │    │ (Monitor,     │
  │  (RAM,    │  │ (HDD,SSD, │    │  Printer,     │
  │   ROM)    │  │  USB)     │    │  Speakers)    │
  └───────────┘  └───────────┘    └───────────────┘
```

The CPU processes data received from input devices, uses primary memory (RAM) for temporary storage during processing, secondary memory (hard disk) for permanent storage, and sends results to output devices. The Control Unit directs the flow of data between all components.

### Q4. Define the following terms: [6 marks]

**(a) Bit** — the smallest unit of data in a computer, representing a single binary digit: either 0 or 1.

**(b) Motherboard** — the main printed circuit board inside a computer that holds and connects all components together, including the CPU, RAM, expansion slots and connectors for peripherals. It allows all parts of the system to communicate.

### Q5. Briefly explain the following as used in the Windows operating system: [2 marks]

**(a) Folder** — a container in the file system used to organise and store files and other folders (sub-folders). Folders help keep related data grouped together, much like physical folders in a filing cabinet.

**(b) Files** — the basic units of storage in a computer; each file contains a piece of data (a document, image, program, etc.) and has a name, type (extension), size and location within a folder.

### Q6. State the parts of the Internet Explorer window. [6 marks]

**Answer:** The main parts of the Internet Explorer window are:

1. **Title bar** — shows the page title and window control buttons (minimise, maximise, close).
2. **Menu bar** — File, Edit, View, Favourites, Tools, Help menus.
3. **Command bar / Toolbar** — buttons for common actions (Back, Forward, Stop, Refresh, Home, Print).
4. **Address bar** — where you type the URL of the website you want to visit.
5. **Tab bar** — allows multiple pages to be open in tabs within one window.
6. **Content area / Browser pane** — the main area that displays the web page.
7. **Status bar** — at the bottom, shows loading progress and security information.

### Q7. Explain the following terms related to binary arithmetic: [2 marks]

**(a) Binary number system** — a base-2 number system using only two digits, 0 and 1. Each position represents a power of 2 (from right: 1, 2, 4, 8, 16, etc.).

**(b) Binary arithmetic** — mathematical operations performed on binary numbers. For example, 1111₂ × 1111₂ = 11100001₂ (which equals 15 × 15 = 225 in decimal).

---

## Section 2: MS Word

### Q8. (CASE STUDY) Mr. Rattan is a trainee editor working with BBB Publishers. He is working on a book related to Computer Hardware. Help Mr. Rattan answer the following: [20 marks]

*The term "computer hw" refers to the physical components of a computer, namely Keyboard, Monitor, Mouse, and Printer, including the digital circuitry. Computer hw is an integral part embedded in all modern day automobiles, microwave ovens, electrocardiograph machines, compact disc players, and other devices. The hw of a computer is not changed frequently, in contrast with software and data. The present computers are much advanced in terms of processing speed and have an efficient memory structure.*

**(a) All the occurrences of the word "hw" need to be substituted by the word "hardware". Name the feature to be used.** [1 mark]

**Answer:** Use **Find and Replace** (Home tab → Editing group → Replace, or press Ctrl+H). In the "Find what" box type "hw" and in the "Replace with" box type "hardware", then click "Replace All" to substitute every occurrence at once.

**(b) The editor needs to create a list of errors at the end of the paragraph. Name the feature.** [1 mark]

**Answer:** **Spelling and Grammar** check (Review tab → Proofing group → Spelling & Grammar, or press F7). Word will scan the document and list errors with suggested corrections.

**(c) To simplify editing selected words, suggest the mouse shortcut for selecting a complete word.** [1 mark]

**Answer:** **Double-click** on the word with the left mouse button. This selects the entire word instantly.

**(d) The word formatting of "computer hw" in the first line needs to be copied on certain other words in the paragraph. Name the feature.** [1 mark]

**Answer:** The **Format Painter** (Home tab → Clipboard group). Double-click the Format Painter to lock it, then click on each target word to apply the same formatting. Press Esc or click Format Painter again to stop.

### Q9. Explain the procedure of creating newspaper-style columns using a table in MS Word. [4 marks]

**Answer:**

1. Insert a table with the desired number of columns (e.g. 2 or 3) and the number of rows needed.
2. Enter the text into the first cell (column). The text flows naturally within the cell boundaries.
3. Adjust column widths by dragging the column borders, or right-click → Table Properties → Column tab to set precise widths.
4. To make it look like newspaper columns without visible borders, select the table → right-click → Table Properties → Borders and Shading → set borders to "None".
5. You can also merge cells for headings that should span across columns, and adjust vertical alignment and cell margins for better readability.

*Using a table for columns gives more control than the Layout → Columns feature, especially when you need different column widths or want to mix text with images in specific columns.*

### Q10. Using Microsoft Word, explain the technique you can use to write letters to 20 people inviting them to an interview without repetitively copying their addresses to the same letter for printing. [6 marks]

**Answer:** This is done using **Mail Merge** (Mailings tab):

1. **Prepare the main document** — create the invitation letter in Word with placeholder fields for the recipient's name, address etc.
2. **Prepare the data source** — create a list (in Excel, Word table, or Outlook contacts) with columns: Name, Address, City, etc. — one row per recipient.
3. **Start Mail Merge** — go to Mailings tab → Start Mail Merge → Letters.
4. **Select recipients** — click Select Recipients → Use an Existing List → browse to your data source file.
5. **Insert merge fields** — place the cursor where each piece of information should go, click Insert Merge Field, and choose the appropriate field (e.g. «Name», «Address»).
6. **Preview and finish** — click Preview Results to cycle through each recipient's letter. When satisfied, click Finish & Merge → Print Documents or Edit Individual Documents to produce all 20 personalised letters.

*This saves hours of repetitive work — the body of the letter is written once and Word automatically fills in each recipient's details.*

---

## Section 3: MS Excel

### Q11. Using examples, explain the meaning of the following operators as used in MS Excel: [4 marks]

**(a) Comma (,) operator** — the comma is used to separate individual arguments within a function. For example, `=SUM(A1:A10, C1:C10)` sums two separate ranges. In some locales it also acts as the union operator, combining multiple references into one.

**(b) Space ( ) operator** — the space is the **intersection operator** in Excel. It returns the cell(s) common to two references. For example, if range A1:A5 and range B2:D2 overlap at cell B2, then `=A1:A5 B2:D2` returns the value in B2.

### Q12. Determine the output of the following formula given in MS Excel: `=5+2*3-1/2` [2 marks]

**Answer:** Following BODMAS/BIDMAS order of operations:
1. Multiplication first: 2 × 3 = 6
2. Division next: 1 / 2 = 0.5
3. Then addition and subtraction left to right: 5 + 6 − 0.5 = **10.5**

### Q13. One can create defined names to represent cells, ranges of cells, formulas, or constant values in MS Excel. Precisely state the procedure for defining a name for a cell. [2 marks]

**Answer:**
1. Select the cell (or range) you want to name.
2. Click in the **Name Box** (the box to the left of the formula bar that shows the cell reference).
3. Type the desired name (e.g. "TaxRate").
4. Press **Enter**.

The name is now defined and can be used in formulas anywhere in the workbook (e.g. `=B1*TaxRate`). Alternatively, use Formulas tab → Define Name for more options including scope and comments.

### Q14. Explain the workings of the IF function in MS Excel. [4 marks]

**Answer:** The IF function is a logical function that returns one value if a condition is TRUE and another value if it is FALSE.

**Syntax:** `=IF(logical_test, value_if_true, value_if_false)`

- `logical_test` — a condition that evaluates to TRUE or FALSE (e.g. `A1>89`).
- `value_if_true` — the result returned when the condition is TRUE.
- `value_if_false` — the result returned when the condition is FALSE.

**Example — assigning letter grades:**

| Score | Grade |
|-------|-------|
| Greater than 89 | A |
| 80 to 89 | B |
| 70 to 79 | C |
| 60 to 69 | D |
| Less than 60 | F |

For cell A2 containing score 45:
`=IF(A2>89,"A",IF(A2>=80,"B",IF(A2>=70,"C",IF(A2>=60,"D","F"))))`

This returns **"F"** because 45 is less than 60.

### Q15. There are three retirement contribution possibilities to account for. Write an IF formula using AND/OR. [6 marks]

*Conditions:*
- Employee works full time AND has been employed two or more years → retirement benefit applies.
- Employee works full time but has NOT been employed two or more years → benefit does not apply.
- Employee does NOT work full time → benefit does not apply.

**Answer:**

Assuming column A = Full Time (TRUE/FALSE), column B = Years Employed:

```
=IF(AND(A2=TRUE, B2>=2), "Benefit Applies", "Benefit Does Not Apply")
```

The AND function requires **both** conditions to be TRUE for the benefit to apply. If either condition is FALSE (not full time, or fewer than 2 years), the formula returns "Benefit Does Not Apply".

### Q16. Using Excel syntax, explain the meanings of the following functions: [9 marks]

**(a) VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])** — looks up a value in the **first column** of a table and returns a value from a column to the right. For example, `=VLOOKUP("Ravioli Angelo", A2:D13, 3, FALSE)` searches for "Ravioli Angelo" in column A and returns the value from column C (the 3rd column) of that row. The FALSE parameter means an exact match is required.

**(b) HLOOKUP(lookup_value, table_array, row_index_num, [range_lookup])** — works like VLOOKUP but searches across the **first row** (horizontally) and returns a value from a specified row below. Use this when your lookup data is arranged in columns rather than rows.

**(c) SUMIF(range, criteria, [sum_range])** — adds up cells in `sum_range` that meet a condition specified in `criteria` against `range`. For example, `=SUMIF(D2:D13, ">10", E2:E13)` sums the values in E2:E13 only where the corresponding cell in D2:D13 is greater than 10.

### Q17. Write a formula to return "Ravioli Angelo" from the Excel spreadsheet. [2 marks]

**Answer (using INDEX/MATCH):**

```
=INDEX(B2:B13, MATCH("Ravioli Angelo", A2:A13, 0))
```

Or using VLOOKUP with a helper approach — if the data were transposed, VLOOKUP would work directly. Since "Ravioli Angelo" is in column B (not column A), INDEX/MATCH is the correct approach here.

### Q18. Write a formula to return "$42.40". [2 marks]

**Answer:** $42.40 appears in the Unit Price column for "Manjimup Dried Apples" (row 7 or row 9). Using INDEX/MATCH:

```
=INDEX(D2:D13, MATCH(42.40, D2:D13, 0))
```

Or to find it by product name:
```
=INDEX(D2:D13, MATCH("Manjimup Dried Apples", B2:B13, 0))
```

### Q19. In Excel, I'm using the VLookup function to return a value, but VLookup returns a #N/A error when no match is found. How can I sum the results when there are instances of #N/A? [4 marks]

**Answer:** Wrap the VLOOKUP in an **IF(ISNA())** or **IFERROR()** function to handle the error:

**Using IFERROR (Excel 2007+):**
```
=SUM(IFERROR(VLOOKUP(E1, $A$2:$D$13, 3, FALSE), 0))
```

**Using IF(ISNA()) (older Excel):**
```
=SUM(IF(ISNA(VLOOKUP(E1, $A$2:$D$13, 3, FALSE)), 0, VLOOKUP(E1, $A$2:$D$13, 3, FALSE)))
```

Both approaches replace the #N/A error with 0, so the SUM function can add the valid results without being disrupted by error values.

*Note: In older Excel versions, you must enter this as an array formula by pressing Ctrl+Shift+Enter.*

### Q20. Given the Students Grade MS Excel sheet: [17 marks]

| | A | B (Thomas) | C (John) | D (McCullum) | E (Alicia) |
|---|---|---|---|---|---|
| 1 | Name | Thomas | John | McCullum | Alicia |
| 2 | Exam#1 | 82 | 65 | 70 | 67 |
| 3 | Exam#2 | 75 | 79 | 55 | 78 |
| 4 | Exam#3 | 81 | 84 | 76 | 78 |
| 5 | Paper | 87 | 74 | 76 | 75 |
| 6 | Participation | 94 | 92 | 80 | 55 |
| 7 | Final Average | | | | |

**(a) Write a formula to calculate the final average for each student in Cell B7.** The three exams should each count for 25%, the paper for 15%, and participation for the remaining 10%. [4 marks]

**Answer:** For Thomas in cell B7:
```
=(B2*0.25)+(B3*0.25)+(B4*0.25)+(B5*0.15)+(B6*0.1)
```

Or using SUMPRODUCT:
```
=SUMPRODUCT(B2:B4, {0.25,0.25,0.25})+B5*0.15+B6*0.1
```

Copy this formula across columns C, D and E for the other students.

**(b) Write a formula to compute the class average for each exam in Cell F2.** [3 marks]

**Answer:** In cell F2:
```
=AVERAGE(B2:E2)
```

This averages Thomas, John, McCullum and Alicia's Exam#1 scores. Copy down for Exam#2, Exam#3, Paper and Participation.

**(c) Explain how to analyse the grade distribution for the final average.** (A=90–100, B=80–89, C=70–79, D=60–69, F=below 60) [5 marks]

**Answer:** Use a nested IF formula in a new column:
```
=IF(B7>=90,"A",IF(B7>=80,"B",IF(B7>=70,"C",IF(B7>=60,"D","F"))))
```

Then use **COUNTIF** to count how many students received each grade:
- `=COUNTIF(F1:F4,"A")` — counts students with grade A
- `=COUNTIF(F1:F4,"B")` — counts grade B, and so on

Create a bar chart or frequency table to visualise the grade distribution across the class.

### Q21. Explain the meaning of the following as used in MS Excel: [6 marks]

**(a) Removing a spreadsheet from a workbook** — right-click the sheet tab at the bottom of the workbook and select "Delete". Excel will prompt for confirmation since the action cannot be undone.

**(b) Changing column width** — hover the mouse over the column border (between two column letters) until the cursor becomes a double-headed arrow, then click and drag to resize. Or right-click the column header → Column Width → type a precise value.

**(c) Sorting data in ascending order** — select the column or range, then Data tab → Sort A to Z (ascending). Excel rearranges the rows based on the values in the selected column, from smallest to largest (or A to Z for text).

---

## Section 4: Internet Computing

### Q22. Explain the following terms as used in internet technology: [6 marks]

**(a) Subject Directories** (also called search directories or web directories) — curated, human-organised listings of websites arranged in hierarchical categories. Unlike search engines which use automated algorithms, subject directories are maintained by editors who review and categorise each site. Examples include the Open Directory Project (DMOZ) and the Yahoo! Directory.

**(b) Spiders** (also called web crawlers or bots) — automated programs used by search engines to systematically browse the World Wide Web. Spiders follow hyperlinks from page to page, reading and indexing the content of each page they visit. The indexed information is then stored in the search engine's database and used to return search results.

### Q23. Differentiate between a search engine and a search directory. [3 marks]

| Feature | Search Engine | Search Directory |
|---------|--------------|------------------|
| **Method** | Automated crawling and indexing by spiders/bots | Human-edited and categorised listings |
| **Coverage** | Billions of pages across the entire web | Smaller, curated collection of websites |
| **Best for** | Specific or obscure queries; finding exact information | General topics; browsing categories when you don't know the exact query |
| **Results** | Ranked by algorithm (relevance, popularity) | Organised by category and sub-category |

### Q24. Briefly explain the following internet search techniques: [6 marks]

**(a) Field Search** — restricting your search to a specific field within a web page or database record, such as the title, URL, or body text. For example, in Google: `intitle:search` finds pages with "search" in the title.

**(b) Title Field** — searching only within document titles, which increases precision since the title usually reflects the main topic. In PubMed, use [ti] to search titles; in Google, use `intitle:`.

**(c) Natural Language Search** — typing a query as an ordinary question or sentence rather than using keywords and Boolean operators. Modern search engines (especially with AI features) can interpret natural language and return relevant results.

### Q25. Describe a basic internet search procedure. [4 marks]

**Answer:**

1. **Identify the information need** — clearly define what you are looking for.
2. **Choose keywords** — break your topic into key concepts and select the most specific and relevant terms.
3. **Construct the search query** — use Boolean operators (AND, OR, NOT), quotes for exact phrases, and operators like `site:`, `intitle:` as needed.
4. **Execute the search** — enter the query in a search engine (Google, PubMed, etc.).
5. **Evaluate results** — review the titles, snippets and URLs; click through to assess relevance and credibility.
6. **Refine if necessary** — add or remove keywords, try synonyms, use advanced search options, or switch to a different search engine or database.

### Q26. Briefly explain the strategies for navigating the Deep Web. [4 marks]

**Answer:** The Deep Web refers to content not indexed by standard search engines — databases, password-protected sites, dynamically generated pages and subscription-only resources. Strategies include:

1. **Direct database access** — go directly to specific databases (e.g. PubMed, JSTOR, government data portals) and use their internal search functions.
2. **Advanced search operators** — use search engine operators like `site:`, `filetype:`, and `inurl:` to find content that may be partially indexed.
3. **Library and institutional portals** — use university library systems that provide access to subscription-based journals and databases.
4. **Specialised search engines** — use tools designed for the Deep Web such as CompletePlanet, Infomine, or the DuckDuckGo !bang syntax.

### Q27. Briefly explain the following terms: [8 marks]

**(a) Internet** — the worldwide public network of interconnected computer networks that use the Internet Protocol Suite (TCP/IP) to link billions of devices globally, enabling communication, data exchange and services like the World Wide Web and email.

**(b) Internet Protocol (IP)** — the set of rules governing how data packets are addressed, routed and transmitted across the internet. IP assigns unique numerical addresses to devices and ensures data reaches the correct destination.

**(c) IP Address** — a unique numerical identifier assigned to each device connected to the internet (e.g. 192.168.1.1 in IPv4, or a longer hexadecimal string in IPv6). It functions like a postal address, allowing data to be routed to the correct device.

**(d) URL (Uniform Resource Locator)** — the address used to access a resource on the internet. A URL consists of: **Scheme** (protocol, e.g. https://), **Host/Domain** (the server, e.g. www.example.com), **Path** (the specific page or file), and optionally a **Query string** (parameters after `?`).

### Q28. Describe a basic internet search procedure (as tested in HIT100 exams). [6 marks]

**Answer:**

1. Open a web browser (Chrome, Firefox, Edge).
2. Navigate to a search engine (Google, Bing, or a medical database like PubMed).
3. Type your search query using relevant keywords.
4. Use advanced techniques as needed:
   - **Boolean operators**: AND (both terms must appear), OR (either term), NOT (exclude a term).
   - **Phrase search**: use quotation marks for exact phrases, e.g. `"dental caries"`.
   - **Domain restriction**: add `site:edu` or `site:gov` to limit to academic or government sites.
5. Review the search results — scan titles and snippets for relevance.
6. Click on the most relevant results and evaluate the information for accuracy, currency and authority.

### Q29. Define the following: [marks varied]

**(a) FTP (File Transfer Protocol)** — a standard protocol used to transfer files between a client computer and a server over the internet. It supports uploading files to a server and downloading files from a server, and can be used with dedicated FTP clients or through a web browser.

**(b) Intranet** — a private, organisation-internal network that uses internet technologies (HTML, HTTP, browsers) but is accessible only to authorised members of the organisation, typically protected by a firewall from the public internet.

**(c) Extranet** — an extension of an organisation's intranet that allows limited access to selected external users such as partners, suppliers or customers, over a secure connection (usually via VPN or encrypted links).

---

## Section 5: SPSS Statistical Analysis

### Q30. Briefly explain the meanings of the following terms as used in SPSS: [4 marks]

**(a) Qualitative variables** (also called categorical variables) — variables that describe a quality or characteristic that cannot be measured numerically. They are placed into categories. Examples include gender (male/female), blood group (A, B, AB, O), and marital status. In SPSS these are measured at the **nominal** or **ordinal** level.

**(b) Quantitative variables** — variables that represent a measurable quantity expressed as numbers. They can be further divided into:
- **Discrete** (countable values, e.g. number of patients)
- **Continuous** (any value within a range, e.g. weight, height, blood pressure)

In SPSS, quantitative variables are typically measured at the **scale** level.

### Q31. Explain the criterion used for accepting or rejecting a null hypothesis. [3 marks]

**Answer:** The criterion is the **level of significance** (denoted α), usually set at **0.05 (5%)** before the study begins.

- If the **p-value** from the statistical test is **less than or equal to α** (p ≤ 0.05), the null hypothesis (H₀) is **rejected** — the result is considered statistically significant, meaning the observed effect is unlikely to have occurred by chance alone.
- If the **p-value is greater than α** (p > 0.05), the null hypothesis is **not rejected** (failed to reject) — there is insufficient evidence to conclude that a real effect or difference exists.

Common significance levels: α = 0.05 (5%), α = 0.01 (1%), or α = 0.10 (10%). A lower α makes the test more stringent.

### Q32. State the features of Variable View as used in SPSS. [3 marks]

**Answer:** The Variable View in SPSS displays and allows editing of the following properties for each variable:

1. **Name** — the variable name used in syntax (must start with a letter, no spaces).
2. **Type** — the data type (Numeric, String, Date, etc.).
3. **Width** — the number of characters allowed.
4. **Decimals** — number of decimal places displayed.
5. **Label** — a descriptive label for the variable (shown in output and graphs).
6. **Values** — value labels (e.g. 1 = "Male", 2 = "Female").
7. **Missing** — values designated as missing data.
8. **Columns** — the display width of the column in Data View.
9. **Align** — left, right or centre alignment.
10. **Measure** — the level of measurement: **Scale**, **Ordinal**, or **Nominal**.
11. **Role** — whether the variable is an input, target, or other role in analysis.

### Q33. Explain the basic steps of data analysis in SPSS. [6 marks]

**Answer:**

1. **Define variables** — open Variable View and set the Name, Type, Label, Values, and Measure for each variable in your dataset.
2. **Enter data** — switch to Data View and type or paste data row by row (each row = one case/participant).
3. **Clean and check data** — use Descriptives, Frequencies or Explore to check for outliers, missing values and errors.
4. **Choose the appropriate statistical test** — based on your research question, data type and level of measurement:
   - Descriptive: frequencies, means, standard deviations
   - Comparison: t-tests, ANOVA, chi-square
   - Association: correlation, regression
5. **Run the analysis** — go to the Analyse menu, select the appropriate sub-menu (e.g. Analyse → Compare Means → Independent-Samples T Test), set the variables, and click OK.
6. **Interpret output** — read the Output Viewer, focusing on the test statistic, degrees of freedom, p-value and confidence intervals. Draw conclusions based on the significance criterion (usually p < 0.05).

### Q34. When should you use a t-test versus a z-test? What is the difference between a one-tailed and two-tailed test? [4 marks]

**Answer:**

**t-test vs z-test:**
- Use a **z-test** when the population variance is known AND the sample size is large (n > 30).
- Use a **t-test** when the population variance is unknown AND/OR the sample size is small (n ≤ 30). This is the more common situation in real research.

**One-tailed vs two-tailed:**
- **Two-tailed test** — tests for a difference in **either direction** (greater than OR less than). H₁: μ₁ ≠ μ₂. Use when you have no prior prediction about the direction of the effect.
- **One-tailed test** — tests for a difference in **one specific direction** only (greater than OR less than, but not both). H₁: μ₁ > μ₂ or H₁: μ₁ < μ₂. Use when you have a strong theoretical reason to predict the direction.

### Q35. What are the different levels of measurement in SPSS? Give an example of each. [3 marks]

**Answer:**

| Level | Description | Example | SPSS Measure |
|-------|-------------|---------|--------------|
| **Nominal** | Categories with no natural order | Blood group (A, B, AB, O), Gender | Nominal |
| **Ordinal** | Categories with a meaningful order, but unequal intervals | Pain scale (mild, moderate, severe), Education level | Ordinal |
| **Interval** | Ordered, equal intervals, but no true zero | Temperature in °C, Calendar year | Scale |
| **Ratio** | Ordered, equal intervals, with a true zero point | Weight, Height, Age, Blood pressure | Scale |

*In SPSS, interval and ratio are both coded as "Scale" in the Measure column.*

---

## Section 6: Ethics & Health Informatics

### Q36. Briefly discuss the benefits and ethical issues of IT in medicine. [5 marks]

**Benefits:**

1. **Electronic health records (EHR)** — instant access to patient history, test results and medications improves continuity of care and reduces errors.
2. **Telemedicine** — patients in remote areas can consult specialists via video, improving access to healthcare.
3. **Medical research** — databases like PubMed and clinical trial registries give clinicians and researchers instant access to the latest evidence.
4. **Digital imaging** — PACS systems allow radiologists to view and share X-rays, CT scans and MRIs electronically.
5. **Health informatics** — data analytics on large populations help identify disease patterns and improve public health.

**Ethical Issues:**

1. **Confidentiality and privacy** — electronic patient records must be protected against unauthorised access; breaches can have serious consequences for patients.
2. **Informed consent** — patients must understand how their data will be used, stored and shared.
3. **Data security** — systems must be protected against hacking, ransomware and data loss through encryption, access controls and regular backups.
4. **Reliability of online information** — not all medical information on the internet is accurate; clinicians must critically appraise sources.
5. **Digital divide** — unequal access to technology can worsen existing health inequalities between urban and rural populations, or between different socioeconomic groups.

### Q37. State the routes to free access to medical journals. [3 marks]

**Answer:**

1. **PubMed Central (PMC)** — a free full-text archive of biomedical and life sciences literature maintained by the U.S. National Library of Medicine.
2. **Directory of Open Access Journals (DOAJ)** — a community-curated list of open access, peer-reviewed journals covering all areas of science and medicine.
3. **Google Scholar** — searches across scholarly literature including theses, books, abstracts and articles; often links to free versions.
4. **Institutional repository** — university libraries often provide free access to journals through their institutional subscriptions.
5. **Research4Life / HINARI** — provides free or low-cost access to health research for institutions in developing countries.

### Q38. What is health informatics? Why is ethical orientation important in e-health? [3 marks]

**Answer:**

**Health informatics** is the interdisciplinary field that combines information science, computer science and health care to manage and analyse health information. It encompasses electronic health records, clinical decision support systems, telemedicine, health data analytics and the interoperability of health IT systems.

**Ethical orientation is important in e-health because:**
- Patient data stored electronically is vulnerable to breaches, so strict confidentiality and security measures are essential.
- The use of AI and algorithms in clinical decision-making raises questions about transparency, accountability and bias.
- Patients must give informed consent for their data to be used in research or shared between providers.
- Health IT systems must be designed to be equitable and accessible, avoiding the creation of a digital divide in healthcare.

---

## Key Topics to Revise

Based on past examinations, the following topics are most frequently tested:

| Topic | Frequency | Key Points |
|-------|-----------|------------|
| **Operating Systems** | Very High | Definition, 3+ functions, block diagram |
| **MS Excel IF function** | Very High | Syntax, nested IF, grading formulas |
| **VLOOKUP/HLOOKUP** | High | Syntax, use cases, error handling |
| **Mail Merge (Word)** | High | Step-by-step procedure |
| **Search engines vs directories** | High | Definitions, differences, examples |
| **SPSS Variable View** | Medium | Features, levels of measure |
| **Hypothesis testing** | Medium | Null hypothesis, p-value, significance level |
| **Ethics in IT** | Medium | Confidentiality, privacy, benefits |

---

*These questions were transcribed from HIT100 Information Technology past examination papers (2012–2021) and online supplementary examinations. Model answers were authored based on the HIT100 course syllabus and standard computing/statistics references.*
