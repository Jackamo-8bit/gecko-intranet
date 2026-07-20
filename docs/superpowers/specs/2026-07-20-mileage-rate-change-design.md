# Mileage rate change

## Purpose

Use a 55p-per-mile reimbursement rate for new mileage from 20 July 2026, without altering historic mileage records.

## Design

The mileage calculation will select its high rate from the journey date:

- Journeys dated before 20 July 2026 continue to use the existing 45p rate for the first 10,000 miles in the driver's tax year.
- Journeys dated on or after 20 July 2026 use 55p for that same band.
- The existing 25p rate above 10,000 miles remains unchanged.
- Existing saved amounts and rate labels remain unchanged. Recalculation therefore preserves the historic rate applicable to each journey rather than retroactively applying 55p.

The rate guidance and generated rate label will show 55p for new eligible journeys. Calculations that cross the 10,000-mile threshold will still use a mixed rate where applicable.

## Validation

Add an executable regression check for the effective-date boundary, the historic 45p rate, the new 55p rate, and the continuing 25p threshold rule. Run it alongside a source check that confirms obsolete 45p wording is not used for new mileage.
