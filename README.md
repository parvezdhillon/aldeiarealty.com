# Aldeia Realty

Premium bilingual real estate website for Portugal's Silver Coast.

## Quick Start

Upload all files to any web host (Netlify, Vercel, GitHub Pages, GoDaddy, etc.).
No build step required — this is pure static HTML/CSS/JS.

## Folder Structure

```
/                          # EN pages (root level)
  index.html               # Home
  properties.html          # Properties
  sell.html                # Sell
  about.html               # About
  careers.html             # Careers
  resources.html           # Resources
  faq.html                 # FAQ
  partner.html             # Partner
  contact.html             # Contact
  calculator.html          # Calculator
  tax-calculator.html      # Tax Calculator
  nhr-guide.html           # NHR Guide
  privacy-policy.html      # Privacy Policy
  complaints.html          # Dispute Resolution
  success.html             # Thank You
/pt/                       # PT pages (Portuguese)
  index.html
  properties.html
  ... (all 15 pages mirrored)
/images/                   # All images
  hero/                    # Hero banners
  banner/                  # Banner images
  locations/               # Area photos
  properties/              # Property photos
  team/                    # Team headshots
  about/                   # About page images
  sell/                    # Sell page images
  careers/                 # Careers images
/logos/                    # AR logos
/css/                      # Shared stylesheet (PT pages reference this)
/js/                       # Shared scripts (PT pages reference this)
```

## Setup Checklist

### 1. Formspree (Contact Forms)

All 7 forms use Formspree. To make them work:

1. Go to [https://formspree.io](https://formspree.io) and create a free account
2. Create a new form — you'll get a unique form ID like `xblddzqw`
3. Replace `YOUR_FORM_ID` in these files:
   - `contact.html` (line ~357)
   - `sell.html` (valuation form)
   - `partner.html` (partner registration)
   - `resources.html` (consultation booking)
   - `pt/contact.html`
   - `pt/sell.html`
   - `pt/partner.html`

Search and replace: `YOUR_FORM_ID` → your actual form ID.

The forms already include:
- JavaScript fetch handlers (no page refresh)
- Loading state on submit button
- Success/error message display
- Form reset after successful submission

### 2. WhatsApp Number

Update the WhatsApp float button on all pages:
- Search: `351912771309`
- Replace with your actual WhatsApp number (with country code, no +)

### 3. Google Fonts

The site uses Google Fonts (Domine + Work Sans) loaded from:
```html
<link href="https://fonts.googleapis.com/css2?family=Domine:wght@400;700&family=Work+Sans:wght@400;600&display=swap" rel="stylesheet">
```

If you want fonts to work offline, download and self-host them.

## Deploy to GitHub Pages

### Option A: Drag & Drop (Simplest)
1. Go to your GitHub repository
2. Navigate to Settings → Pages
3. Select "Deploy from a branch" → choose `main` branch
4. Select folder: `/ (root)`
5. Your site will be live at `https://yourusername.github.io/repository-name/`

### Option B: Git Command Line
```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
# Copy all files from github-ready/ into this folder
cp -r /path/to/github-ready/* .
git add .
git commit -m "Deploy Aldeia Realty website"
git push origin main
```

### Option C: GitHub Desktop
1. Open GitHub Desktop
2. Add local repository → select the `github-ready` folder
3. Publish to GitHub
4. Enable GitHub Pages in repository Settings

## Deploy to Netlify

### Option A: Drag & Drop
1. Go to [https://app.netlify.com](https://app.netlify.com)
2. Drag the `github-ready` folder onto the deploy area
3. Site is live instantly

### Option B: Connect GitHub
1. Link your GitHub repository to Netlify
2. Auto-deploys on every push

## Brand Colours
- Teal: `#296662`
- Gold: `#efd48f`
- Parchment: `#f4ecdc`
- Dark: `#1c0a04`
- Coral: `#c64f2f`

## Fonts
- **Domine** (serif, headings)
- **Work Sans** (sans-serif, body)

## Pages (15 EN + 15 PT = 30 total)

| Page | Description |
|------|-------------|
| Home | Hero, properties, testimonials, areas |
| Properties | Property listings with details |
| Sell | Seller guide with valuation form |
| About | Team bios (Angela, Parvez, Patrick, Telmo) |
| Careers | Agent recruitment with application form |
| Resources | Seller consultation booking |
| FAQ | 18 questions with accordion |
| Partner | Co-broke registration |
| Contact | Contact form + details |
| Calculator | Property purchase cost calculator |
| Tax Calculator | Property tax breakdown |
| NHR Guide | Non-Habitual Resident guide |
| Privacy Policy | GDPR privacy policy |
| Complaints | Dispute resolution page |
| Success | Form submission thank you |

## Legal
- Company: Aldeia Realty - Real Estate, LDA
- NIPC: 517693032
- Copyright: © 2026 Aldeia Realty - Real Estate, LDA. All rights reserved.
