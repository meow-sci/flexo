`SolSystemAstronomicals.xml` and `SolSystemVehicles.xml` are byte-identical copies of the files under KSA build 5801 `Content/Core`. The private mirror currently omits them. ICRP uses them as fallbacks when those XML files are unavailable under `/ksa/`; live files take precedence. Refresh both from the current game build when updating the baseline. They contain no binary planet payloads.

The `mini-*.xml` files are synthetic, trimmed current-schema inputs for system and landmark tests.
