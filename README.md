# chinese-restaurant-generator
Satirical app for generating chinese restaurant names

A two-reel slot machine that mixes and matches words into strip-mall restaurant names
("Jade Garden", "Golden Dragon Super Buffet", "Wok This Way & Sushi").

Plain HTML/CSS/JS with no build step; served by GitHub Pages.

| File | What it is |
| --- | --- |
| `index.html` | Page markup and inline SVG artwork (pagoda roof, lucky cat, lanterns, cookie, takeout box) |
| `style.css` | All styling and animation |
| `app.js` | Reels, odds, share links, sound effects, fortune cookie |
| `words.js` | **All word lists and joke content — edit this to change names, taglines, dishes, fortunes** |
| `assets/` | Favicon and social preview image |
| `tools/og.html` | Source for `assets/og-image.png` (screenshot at 1200×630 to regenerate) |

Run locally: `python3 -m http.server` and open http://localhost:8000.

Share links look like `#jade+garden+and-sushi`; the same name always gets the same
year, phone number, house specialty and fortune.
