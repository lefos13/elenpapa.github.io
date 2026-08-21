# Timeline Mapping (2025-11-15)

This document records how each cover image in `public/images/books` maps to the updated timeline entries. Titles were normalized to dev‑friendly placeholders (`Lorem Ipsum Vol NN`) and blurbs set to lorem ipsum. Years were assigned deterministically from 2025 downward in the order the files were detected.

- Title pattern: `Lorem Ipsum Vol NN`
- Year assignment: start 2025 and decrement by 1 per subsequent item
- Cover path: `/images/books/<filename>`

| #   | File Name                                | Cover Path                                             | New Title          | Year |
| --- | ---------------------------------------- | ------------------------------------------------------ | ------------------ | ---- |
| 01  | 18 Μέρες Μετά.jpg                        | /images/books/18 Μέρες Μετά.jpg                        | Lorem Ipsum Vol 01 | 2025 |
| 02  | 9786182250488.jpg                        | /images/books/9786182250488.jpg                        | Lorem Ipsum Vol 02 | 2024 |
| 03  | Absent.jpg                               | /images/books/Absent.jpg                               | Lorem Ipsum Vol 03 | 2023 |
| 04  | Once Upon A Horror Time.jpg              | /images/books/Once Upon A Horror Time.jpg              | Lorem Ipsum Vol 04 | 2022 |
| 05  | Wednesday.jpg                            | /images/books/Wednesday.jpg                            | Lorem Ipsum Vol 05 | 2021 |
| 06  | Ένα μόνο γράμμα.jpg                      | /images/books/Ένα μόνο γράμμα.jpg                      | Lorem Ipsum Vol 06 | 2020 |
| 07  | Αίμα από ασήμι.jpg                       | /images/books/Αίμα από ασήμι.jpg                       | Lorem Ipsum Vol 07 | 2019 |
| 08  | Αυτόματη Εστιαση.jpg                     | /images/books/Αυτόματη Εστιαση.jpg                     | Lorem Ipsum Vol 08 | 2018 |
| 09  | Για λίγο σ' αγαπώ.png                    | /images/books/Για λίγο σ' αγαπώ.png                    | Lorem Ipsum Vol 09 | 2017 |
| 10  | Δείπνο Δολοφόνων.jpg                     | /images/books/Δείπνο Δολοφόνων.jpg                     | Lorem Ipsum Vol 10 | 2016 |
| 11  | Η κραυγή της μάνας.jpg                   | /images/books/Η κραυγή της μάνας.jpg                   | Lorem Ipsum Vol 11 | 2015 |
| 12  | Η Μαντάμ 2.jpg                           | /images/books/Η Μαντάμ 2.jpg                           | Lorem Ipsum Vol 12 | 2014 |
| 13  | Η Σιωπή του Πίνακα.jpg                   | /images/books/Η Σιωπή του Πίνακα.jpg                   | Lorem Ipsum Vol 13 | 2013 |
| 14  | Ηλιαχτίδα.jpg                            | /images/books/Ηλιαχτίδα.jpg                            | Lorem Ipsum Vol 14 | 2012 |
| 15  | Μέχρι Τέλους.jpg                         | /images/books/Μέχρι Τέλους.jpg                         | Lorem Ipsum Vol 15 | 2011 |
| 16  | Μια Αιματοβαμμένη Νύχτα στην Τοσκάνη.jpg | /images/books/Μια Αιματοβαμμένη Νύχτα στην Τοσκάνη.jpg | Lorem Ipsum Vol 16 | 2010 |
| 17  | Οι Κόρες της Μάγισσας.jpg                | /images/books/Οι Κόρες της Μάγισσας.jpg                | Lorem Ipsum Vol 17 | 2009 |
| 18  | Πεφταστέρι.jpg                           | /images/books/Πεφταστέρι.jpg                           | Lorem Ipsum Vol 18 | 2008 |
| 19  | Τι κι αν.jpg                             | /images/books/Τι κι αν.jpg                             | Lorem Ipsum Vol 19 | 2007 |
| 20  | Το Μυστικό της Κρήνης.jpg                | /images/books/Το Μυστικό της Κρήνης.jpg                | Lorem Ipsum Vol 20 | 2006 |
| 21  | Το Τέκνο της Λύτρωσης.jpg                | /images/books/Το Τέκνο της Λύτρωσης.jpg                | Lorem Ipsum Vol 21 | 2005 |
| 22  | Χάλκινο Κλειδί.jpeg                      | /images/books/Χάλκινο Κλειδί.jpeg                      | Lorem Ipsum Vol 22 | 2004 |

Notes:

- Prior entries referencing `/images/books/book1.jpg`, `/images/books/book2.jpg`, and `/images/books/book3.jpg` have been replaced to match actual files present.
- If you prefer a different year scheme or want specific titles, tell me the mapping and I’ll update both `timeline.json` and this doc.
