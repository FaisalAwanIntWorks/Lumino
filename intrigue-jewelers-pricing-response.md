# Response to Intrigue Jewelers — Lab Diamond Pricing Audit (7 Sep 2026)

Prepared by JewlX · 12 September 2026

## Summary

Thank you for the audit — it is accurate about what you are seeing on screen, and the diagnosis is close. The good news is that nothing in the ring builder needs to be rebuilt. Every symptom in your document traces back to three settings on your own Diamonds catalog screen, and all three are yours to change today.

The short version: your stone list is currently sorted **most expensive first** and capped at **5 stones per band**. The result is that the builder shows you only the five priciest outliers in each size band and discards the other tens of thousands of stones — including the ones priced right at your cost basis.

## What we checked in your account

Your diamond catalog is running live off the shared inventory pool with these saved settings:

| Setting | Currently |
| --- | --- |
| Lab markup | 3% |
| Natural markup | 1.5% |
| Options shown per stone type | 5 |
| Price sort | High to low |
| Lab price ceiling | Not set |
| Colour filter | Not restricted |
| Clarity filter | VS1, VS2, VVS1, VVS2 |

And here is what the inventory actually holds at 1.50–1.99 ct, lab:

- 116,851 stones available to you
- Median price **$193 total** (about $120 per carat)
- Cheapest around **$117 total**
- Cheapest G/VS1 stones: $132, $134, $135, $136 — total price, not per carat

Your document states your lab goods run $100–120 per carat. The pool sits at almost exactly that. The $17,999 and $42,190 stones in your appendix are real listings, but they are the far tail — and the high-to-low sort is pinning your display to that tail.

## Point by point

**1. "The pricing is far too high."**

Correct on screen, wrong about the cause. It is not that the feed is expensive; it is that the sort order is selecting the five most expensive stones per band. Flip the sort to low-to-high and the same bands open in the low hundreds.

**2. "Cut the lab section to two options per band."**

Already a setting. "Show per stone type" is set to 5 and can be set to 2 now. No development required.

**3. "Colour and clarity are inverted against price" / "Bands don't scale."**

Both are the same artefact. You are comparing five arbitrary top-of-tail listings, which have no relationship to each other. Once the list is cheapest-first with a price ceiling and two fixed specs, the ladder becomes orderly in every band.

**4. "The feed is unfiltered."**

It is filtered — by your saved filter. What is not filtered is the price ceiling, which is empty, so nothing stops a $42,190 listing from qualifying.

## What to change (settings only)

On your Diamonds catalog screen:

1. **Price sort** → Low to high
2. **Show per stone type** → 2
3. **Lab price max** → a ceiling that matches your target retail (we suggest starting at $600 on the pool price)
4. **Colour** → F and G only; **Clarity** → VS2 and VVS2 only — this gives you exactly the "Our Standard (G/VS2) / Premium (F/VVS2)" ladder you proposed, in all nine bands
5. **Lab markup** → your chosen multiple: enter **300%** for 4×, **500%** for 6×
6. Re-sync the catalog so the widget picks it up

Both proposed specs are well stocked across every band — hundreds to thousands of stones each — so the ladder will never come up empty.

## What the ladder looks like at 4×

Based on the cheapest currently available stone in each band and spec:

| Band | Our Standard (G/VS2) | Premium (F/VVS2) |
| --- | --- | --- |
| 0.50 – 0.99 ct | ~$310 | ~$265 |
| 1.00 – 1.49 ct | ~$405 | ~$445 |
| 1.50 – 1.99 ct | ~$550 | ~$580 |
| 2.00 – 2.49 ct | ~$730 | ~$860 |
| 2.50 – 2.99 ct | ~$815 | ~$980 |
| 3.00 – 3.49 ct | ~$950 | ~$1,205 |
| 3.50 – 3.99 ct | ~$1,160 | ~$1,380 |
| 4.00 – 4.49 ct | ~$1,305 | ~$1,540 |
| 4.50 – 4.99 ct | ~$1,685 | ~$1,745 |

Compare that against your "At 4×" column — it lands in the same territory, which confirms the cost basis you are working from is the same one the pool is quoting.

## Your open questions

**What multiple do we want on lab stones?** Entirely yours. It is entered as a markup percentage per stone type, separately for lab and natural, and there is no cap at our end.

**Is G/VS2 and F/VVS2 right?** From an availability standpoint, yes — both are deeply stocked in every band, so the ladder holds from 0.50 ct to 4.99 ct.

**Is the $1,860 setting price inclusive or additive?** Additive. The ring total is setting style + shank + metal + stone. The "starting at" figure on the carat step covers the setting side; the stone price is added to it.

**Exact stone prices or band-level "starting at"?** Either works. With two options per band and a price ceiling, exact prices are safe to show. If you would rather keep it conversational, we can set the step to show the band entry price only.

**How much of the Nivoda integration can JewlX let us override?** Colour, clarity, cut, polish, symmetry, fluorescence, lab, carat range, price floor, price ceiling, sort order, number of options per stone type, and markup per stone type — all controlled by you, no development needed.

## Two things to be straight about

- With these settings the builder still shows **real listed stones**, not a synthetic grid. Prices will move a little as inventory turns. If you want a fixed, fully auditable grid computed purely from cost × band midpoint × your multiple — never reading a listing price at all — that is a build, and we would scope it separately.
- Your **Natural tab** has the same sort-and-limit behaviour, and natural markup is currently sitting at 1.5%. We recommend the same pass over it once the lab side is settled.

## Next step

Tell us your target multiple and your preferred price ceiling and we will apply all six settings on your account and re-sync, or walk your team through doing it on the catalog screen — whichever you prefer.
