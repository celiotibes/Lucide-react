# Marketing System — Quick Navigation

Welcome to the Kitnets UFSC Marketing & Lead Management System. Start here.

## 📦 What's Included

This package contains everything needed to manage student housing rentals with automated lead tracking, SLA monitoring, and property occupancy sync.

## 🚀 Getting Started (Choose Your Path)

### I'm Setting Up for the First Time
→ Start with **[SETUP.md](SETUP.md)** (Step-by-step guide, ~90 minutes)

1. Google Sheets setup (30 min)
2. Apps Script installation (20 min)
3. Configure triggers (10 min)
4. Landing page deployment (15 min)
5. Testing & validation (15 min)

### I Want to Understand the System
→ Read **[README.md](README.md)** (Comprehensive reference)

- How everything works
- File structure
- Configuration options
- Troubleshooting
- Customization examples

### I Need to Deploy Right Now
→ Quick deployment:

```bash
# Landing page to Vercel
cd landing/
vercel

# Dashboard to Netlify
cd ../dashboard/
netlify deploy
```

## 📂 File Structure

```
marketing-system/
├── INDEX.md                          # You are here
├── README.md                         # Full reference (architecture, features)
├── SETUP.md                          # Installation guide (6 parts)
│
├── central-leads-kitnets-ufsc.xlsx   # Google Sheets workbook
│   ├── Leads sheet                   # CRM data (17 columns)
│   ├── Campanhas sheet               # Weekly channel tracking
│   ├── Painel sheet                  # Dashboard with IMPORTRANGE
│   └── Instruções sheet              # User instructions (Portuguese)
│
├── scripts/
│   └── AppsScript.gs                 # Automation code (174 lines)
│       ├── checkSLA()                # Alert on slow response
│       ├── checkFollowUps()          # 24-48h closing reminders
│       ├── checkReviewRequests()     # 15d tenant reviews
│       └── onEditLeadsSheet()        # Reverse sync (close→rented)
│
├── dashboard/
│   └── painel.html                   # Live KPI dashboard
│       ├── Overview section          # Top metrics
│       ├── Channel performance       # By source (social, paid, etc)
│       ├── Sales funnel              # Stages (Novo→Visitou→Fechado)
│       ├── Weekly targets            # Sprint tracking
│       ├── Trend analysis            # Historical KPIs
│       └── Lead quality              # Source efficiency
│
└── landing/
    └── index.html                    # Property showcase page
        ├── Pottker 25 card           # With WhatsApp CTA
        ├── Milton Sullivan 142 card  # With WhatsApp CTA
        └── Ana Maria Nunes 214 card  # With WhatsApp CTA
```

## 🔑 Key Concepts

### The Lead Funnel

```
NOVO (New)
  ↓ [SLA: 10 min response time]
  ↓ [Alert email if no response]
  ↓
VISITOU (Visited)
  ↓ [24-48h closing reminder]
  ↓
FECHADO (Closed)
  ↓ [Reverse sync to property sheet]
  ↓ [Unit marked as "Alugada" (Rented)]
```

### What Automates

| Event | Trigger | Action |
|-------|---------|--------|
| Lead added as "Novo" | Every 5 min | SLA check → Email alert if 10+ min |
| Status → "Visitou" | Manual | Follow-up reminder queued |
| 24-48 hours after visit | Hourly | Email: "Time to close" |
| 15 days into contract | Daily | Email: "Request Google/Airbnb review" |
| Status → "Fechado" | Edit event | Reverse sync: Update central sheet unit status |

### Metrics Tracked

- **Leads**: Total by channel
- **Conversion Rate**: Fechado ÷ Total
- **CPL**: Cost Per Lead (Investment ÷ Leads)
- **CAC**: Customer Acquisition Cost (Total spend ÷ Closed deals)
- **Occupancy**: Live from central property sheet
- **SLA Compliance**: % leads responded to within 10 min

## 💻 Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Data | Google Sheets | CRM, lead tracking, metrics |
| Automation | Google Apps Script | Time-based alerts, sync, emails |
| Frontend | HTML5 + CSS3 | Dashboard & landing page (no frameworks) |
| Hosting | Static (Vercel, Netlify, self) | Landing page & dashboard deployment |
| Integration | IMPORTRANGE | Real-time data sync between sheets |
| Communication | WhatsApp API | Pre-filled lead contact links |

## ⚙️ Configuration Checklist

Before going live:

- [ ] Central property sheet created with property data
- [ ] Leads sheet imported into Google Sheets
- [ ] PLANILHA_CENTRAL_ID updated in AppsScript.gs
- [ ] OPERATOR_EMAIL set to your email
- [ ] SLA_MINUTOS adjusted (default: 10)
- [ ] All four triggers installed in Apps Script
- [ ] IMPORTRANGE authorized in Painel sheet
- [ ] Landing page phone number updated (WhatsApp)
- [ ] Landing page deployed (Vercel/Netlify/self-hosted)
- [ ] Dashboard tested with sample lead
- [ ] Reverse sync tested (lead Fechado → unit updated)

## 📞 Support Resources

- **System questions** → See README.md
- **Setup issues** → See SETUP.md troubleshooting
- **Code customization** → Edit scripts/AppsScript.gs or dashboard/painel.html
- **Deployment help** → Vercel docs (vercel.com/docs) or Netlify docs (netlify.com/docs)

## 🔒 Security Notes

✓ All data stays in your Google Sheets (encrypted HTTPS)  
✓ No API keys stored in code  
✓ Apps Script uses your OAuth (you approve permissions)  
✓ WhatsApp links are public (pre-filled messages, no credentials)  
✓ Operator email only (celiotibes@gmail.com → change to yours)  

## 🆘 Common Tasks

### Change SLA Time
File: `scripts/AppsScript.gs` line 10
```javascript
var SLA_MINUTOS = 10;  // Change to desired minutes
```

### Update WhatsApp Number
File: `landing/index.html` (find and replace)
```
https://wa.me/554140425242  →  https://wa.me/[YOUR_NUMBER]
```

### Add New Property
1. Create sheet in central sheet with property name
2. Add to AppsScript.gs line 78: `abas = ["...", "New Property"]`
3. Verify columns: A=Unit#, I=Status, J=Tenant, K=Date

### Customize Email Message
File: `scripts/AppsScript.gs` lines 39–41 (SLA message)
```javascript
var sugestao = publico === "Profissional"
  ? "Your custom message for professionals"
  : "Your custom message for students";
```

## 📊 Dashboard Preview

The dashboard provides real-time visualization of:
- Total leads & conversion rate
- Weekly spend breakdown by channel
- Sales funnel distribution
- Cost per lead by source
- Monthly revenue projection
- Lead quality metrics (time to first response)

Access it: `dashboard/painel.html` (browser or deployment URL)

## 🎯 Next Steps

**Immediate (Today)**
1. Read SETUP.md completely
2. Create central property sheet
3. Import leads workbook

**Short-term (Week 1)**
1. Install Apps Script triggers
2. Test with sample lead
3. Deploy landing page

**Ongoing**
1. Enter leads via landing page or manual entry
2. Update statuses as deals progress
3. Monitor dashboard weekly
4. Adjust campaigns based on CPL/CAC metrics

---

**Version**: 2.0 (Audited & Production-Ready)  
**Last Updated**: July 2026  
**Questions?** Check README.md or SETUP.md troubleshooting sections.
