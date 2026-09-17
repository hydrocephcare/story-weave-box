# SPSS Statistical Analysis — HIT100 Course Notes

*Course notes for the SPSS section of HIT100 Information Technology, University of Nairobi. Covers the SPSS interface, data entry and manipulation, descriptive statistics, graphs and charts, and comparative statistics including t-tests and hypothesis testing.*

## Course Objective

This course is designed to give a basic understanding of how SPSS works and how to run simple statistical analysis of data. SPSS (Statistical Package for the Social Sciences) is one of the most widely used programs for data management and statistical analysis in health and social science research.

## Learning Outcomes

By the end of this course, students should be able to:

- Explain the layout and interface of SPSS: the **Data Editor**, **Syntax Editor**, and **Output Viewer**.
- Get to know the main menus: **Data**, **Transform**, **Analyze**, and **Graphs**.
- Open and create new datasets.
- Run descriptive statistics and frequencies.
- Run chi-square, t-tests, and correlations.
- Transform variables through **Compute** and **Recode**.
- Run regression.
- Create graphs: scatter plots with fitted lines, pie charts, and histograms.
- Import and export data.

## (a) Basics of SPSS

- **Basics of SPSS** — the four main windows: the Data Editor (where data is entered), the Output Viewer (where results appear), the Syntax Editor (where command syntax is written), and the Chart Editor.
- **Descriptive statistics, charts and graphs, data and variable view, how to enter data** — each variable is a column, each case is a row. The Data Editor has two tabs:
  - **Data View** — where actual values are typed.
  - **Variable View** — where variable names, types, labels and other properties are defined.
- **Editing: cut and paste, copy and paste** — standard clipboard operations within and between datasets.

## (b) Manipulation

- **Variable definition** — setting the name, type, width, decimals, label, values and measure for each variable.
- **Inserting variables** and **inserting cases** — adding new columns or rows.
- **Transforming the data** — creating new variables using the **Transform → Compute Variable** dialog.
- **Different levels of measure**:
  - **Scale** — continuous numeric data (e.g. weight, height, age).
  - **Ordinal** — categories with a natural order (e.g. mild, moderate, severe).
  - **Nominal** — categories with no meaningful order (e.g. blood group, sex).
- **How can one enter raw data into SPSS efficiently, how to label the data** — plan your variable names first, use the Variable View to define labels and value labels, and enter data case by case.

## (c) Basic Descriptive Statistics

- **Measures of central tendency**:
  - **Mean** — the arithmetic average.
  - **Median** — the middle value when data is arranged in order.
  - **Mode** — the most frequently occurring value.
- **Measures of dispersion**:
  - **Range** — the difference between the largest and smallest values.
  - **Standard deviation** — the average distance of values from the mean.
  - **Variance** — the square of the standard deviation.

Run these through **Analyze → Descriptive Statistics → Descriptives** or **Frequencies**.

## (d) Graphs and Charts

- **Bar chart** — for comparing counts or frequencies across categories.
- **Pie chart** — for showing proportions of a whole.
- **Histogram** — for showing the distribution of a continuous variable.
- **Scatter plot** — for showing the relationship between two continuous variables; a fitted regression line can be added.
- **Box plot** — for showing the distribution and outliers of a variable.
- **p-p plot** — for checking whether data follows a normal distribution (probability–probability plot).
- **Time series** — for plotting values over time.

Which chart should be used in different situations? Use a **bar or pie chart** for categorical data, a **histogram** for the distribution of one continuous variable, and a **scatter plot** for the relationship between two continuous variables.

## (e) Comparative Statistics 1: Comparing Means Among Groups

- **Comparing two groups using parametric statistics**:
  - **Two-sample t-test** (independent samples t-test) — compares the means of two separate groups, e.g. blood pressure in males vs females.
  - **Paired t-test** — compares two measurements taken from the same subjects, e.g. before vs after treatment.
- **Hypothesis analysis with SPSS** — testing dependence/independence and the **level of significance** (usually α = 0.05).
- **Hypothesis testing** — the process of stating a null hypothesis (H₀), collecting data, computing a test statistic, and deciding whether to reject H₀ based on the p-value.
- **Testing for normal/uniform distribution** — using tests such as Kolmogorov–Smirnov and Shapiro–Wilk, and graphs such as histograms, box plots and p-p plots to check whether data is normally distributed.

## Key Skills for Exams

Be ready to explain the **Data View vs Variable View**, the three **levels of measure** (scale, ordinal, nominal), the difference between the **mean, median and mode**, when to use an **independent vs paired t-test**, and the purpose of **hypothesis testing** with significance levels. Knowing the menu path for each procedure (Analyze → Descriptive Statistics / Compare Means) is often tested directly.
