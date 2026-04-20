# DATA Summary Formulas

Use this inside your `DATA` sheet once you have a normalized/helper range with these named ranges:

- `dateCol`
- `brandCol`
- `campaignCol`
- `phoneCol`
- `platformCol`
- `locationCol`
- `hourCol`

Recommended layout in `DATA`:

- Keep your current mapping rows at the top.
- Put the summary header row in `F20:AD20`.
- Paste the formulas below starting in row `21`.

## Headers

`F20:AD20`

```text
Report Type,Report Brand,Report Date,Actual,Contacted,Non Contacted,Interested,Prompt Used,Imported At,Total Leads,Bigwing Leads,Redwing Leads,Unique Phone Campaign Pairs,Bigwing Unique Phone Campaign Pairs,Redwing Unique Phone Campaign Pairs,Instagram Leads,Facebook Leads,Bigwing Instagram Leads,Bigwing Facebook Leads,Redwing Instagram Leads,Redwing Facebook Leads,Hourly Breakdown,Campaign Counts,Bigwing Response Counts,Redwing Location Counts
```

## Formulas

`F21`

```gs
=ARRAYFORMULA(IF(H21:H="","", "dashboard_daily_summary"))
```

`G21`

```gs
=ARRAYFORMULA(IF(H21:H="","", "all"))
```

`H21`

```gs
=SORT(UNIQUE(FILTER(dateCol, dateCol<>"")))
```

`I21:N`

Leave blank for summary rows. Those columns are only for the digital import rows.

`O21`

```gs
=MAP(H21:H, LAMBDA(d, IF(d="", "", COUNTIF(dateCol, d))))
```

`P21`

```gs
=MAP(H21:H, LAMBDA(d, IF(d="", "", COUNTIFS(dateCol, d, brandCol, "bigwing"))))
```

`Q21`

```gs
=MAP(H21:H, LAMBDA(d, IF(d="", "", COUNTIFS(dateCol, d, brandCol, "redwing"))))
```

`R21`

```gs
=MAP(H21:H, LAMBDA(d, IF(d="", "", IFERROR(COUNTUNIQUE(FILTER(phoneCol&"|"&campaignCol, dateCol=d, phoneCol<>"", campaignCol<>"")), 0))))
```

`S21`

```gs
=MAP(H21:H, LAMBDA(d, IF(d="", "", IFERROR(COUNTUNIQUE(FILTER(phoneCol&"|"&campaignCol, dateCol=d, brandCol="bigwing", phoneCol<>"", campaignCol<>"")), 0))))
```

`T21`

```gs
=MAP(H21:H, LAMBDA(d, IF(d="", "", IFERROR(COUNTUNIQUE(FILTER(phoneCol&"|"&campaignCol, dateCol=d, brandCol="redwing", phoneCol<>"", campaignCol<>"")), 0))))
```

`U21`

```gs
=MAP(H21:H, LAMBDA(d, IF(d="", "", COUNTIFS(dateCol, d, platformCol, "ig"))))
```

`V21`

```gs
=MAP(H21:H, LAMBDA(d, IF(d="", "", COUNTIFS(dateCol, d, platformCol, "fb"))))
```

`W21`

```gs
=MAP(H21:H, LAMBDA(d, IF(d="", "", COUNTIFS(dateCol, d, brandCol, "bigwing", platformCol, "ig"))))
```

`X21`

```gs
=MAP(H21:H, LAMBDA(d, IF(d="", "", COUNTIFS(dateCol, d, brandCol, "bigwing", platformCol, "fb"))))
```

`Y21`

```gs
=MAP(H21:H, LAMBDA(d, IF(d="", "", COUNTIFS(dateCol, d, brandCol, "redwing", platformCol, "ig"))))
```

`Z21`

```gs
=MAP(H21:H, LAMBDA(d, IF(d="", "", COUNTIFS(dateCol, d, brandCol, "redwing", platformCol, "fb"))))
```

`AA21`

```gs
=MAP(H21:H, LAMBDA(d, IF(d="", "", TEXTJOIN("|", TRUE, MAP(SEQUENCE(24, 1, 0, 1), LAMBDA(h, TEXT(h, "00")&"="&COUNTIFS(dateCol, d, hourCol, h)&","&COUNTIFS(dateCol, d, brandCol, "bigwing", hourCol, h)&","&COUNTIFS(dateCol, d, brandCol, "redwing", hourCol, h)))))))
```

`AB21`

```gs
=MAP(H21:H, LAMBDA(d, IF(d="", "", IFERROR(LET(c, SORT(UNIQUE(FILTER(campaignCol, dateCol=d, campaignCol<>""))), TEXTJOIN("|", TRUE, MAP(c, LAMBDA(x, x&"::"&COUNTIFS(dateCol, d, campaignCol, x))))), ""))))
```

`AC21`

```gs
=MAP(H21:H, LAMBDA(d, IF(d="", "", TEXTJOIN("|", TRUE, MAP({"yes";"no"}, LAMBDA(x, x&"::"&COUNTIFS(dateCol, d, brandCol, "bigwing", locationCol, x)))))))
```

`AD21`

```gs
=MAP(H21:H, LAMBDA(d, IF(d="", "", IFERROR(LET(loc, SORT(UNIQUE(FILTER(locationCol, dateCol=d, brandCol="redwing", locationCol<>""))), TEXTJOIN("|", TRUE, MAP(loc, LAMBDA(x, x&"::"&COUNTIFS(dateCol, d, brandCol, "redwing", locationCol, x))))), ""))))
```

## Important Note

`R/S/T` are exact for one day, but if the same `phone + campaign` repeats on multiple dates, summing daily rows is not a true multi-day de-dup. If you want exact range-wide unique pairs too, we should add a second precomputed pair table.
