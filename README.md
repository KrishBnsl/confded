# CS Conference Deadlines (personal Chrome extension)

Countdown popup, toolbar badge and reminders for computer-science conference
deadlines. Data comes from the open [CCFDDL](https://ccfddl.com/) dataset
(MIT licensed, https://github.com/ccfddl/ccf-deadlines) and refreshes
automatically; there is nothing to visit or scrape.

## Install
1. Open `chrome://extensions` and turn on **Developer mode**.
2. **Load unpacked** and pick this folder.
3. Click the toolbar icon. The first download takes a second or two.

## How it works
- The background worker downloads `https://ccfddl.com/conference/allconf.json`
  on install and then at most once every ~20 hours (an alarm checks every 6 h).
  It keeps the old data if a download fails or looks wrong. Press the refresh
  button in the popup to force it.
- Each deadline is converted to an exact instant using its time zone (AoE, UTC±N,
  PT), so countdowns are accurate and shown in your local time.
- Only upcoming deadlines (and ones that are "TBD") are kept: about 160 editions,
  roughly 60 KB.

## Using it
- **Filters:** area chips (AI, DB, SE, ...) and a minimum rank (CORE rank, falling
  back to CCF). Defaults: all areas, A* and A.
- **Star** a venue to always show and be reminded about it, regardless of filters.
- **Search** finds any venue and ignores the filters, so you can find something
  to star.
- **Badge:** number of followed deadlines due within 7 days.
- **Notifications:** 7, 3, 1 days before, and within 24 h, for followed venues.
  If refreshing fails for over a week you get a daily nudge.

## Caveats
- Areas are the 10 CCF categories, not finer topics like NLP or CV; use stars for
  specific venues.
- The dataset is community maintained, so a venue can be missing or late (e.g. a
  conference whose next edition has not been added yet).
- Click a notification to open the conference site.
