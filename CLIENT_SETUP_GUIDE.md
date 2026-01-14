# Client Setup Guide - FieldTech Deployment

This guide walks through setting up FieldTech for a new HVAC/service contractor client.

## Quick Start (5 minutes)

### Step 1: Fork the Project

1. Go to the FieldTech Replit project
2. Click the three-dot menu (⋮) → "Fork"
3. Name it after your client (e.g., "AcmeHVAC-FieldTech")

### Step 2: Configure Client Branding

Open the **Secrets** tab (lock icon in sidebar) and add these environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_COMPANY_NAME` | Company name shown in app | Acme HVAC |
| `VITE_COMPANY_TAGLINE` | Tagline (optional) | Quality Service Since 1985 |
| `VITE_SUPPORT_EMAIL` | Support email | support@acmehvac.com |
| `VITE_SUPPORT_PHONE` | Support phone | (555) 123-4567 |
| `COMPANY_NAME` | Backend company name | Acme HVAC |
| `TIMEZONE` | Default timezone | America/New_York |

### Step 3: Database Setup

The database is automatically created when you fork. To initialize the schema:

1. Open the **Shell** tab
2. Run: `npm run db:push`
3. Wait for "Done" message

### Step 4: Publish

1. Click the **Publish** button (top right)
2. Select "Autoscale" for web apps
3. Add payment method if required
4. Click "Publish"

Your client's app is now live!

---

## Detailed Configuration

### Service Types

Customize which service types appear in job creation. Set `SERVICE_TYPES` in Secrets:

```
hvac_repair,hvac_maintenance,ac_install,furnace_repair,duct_cleaning,thermostat_install
```

For plumbing companies:
```
plumbing_repair,pipe_repair,drain_cleaning,water_heater,fixture_install,emergency
```

### User Roles

**Office Staff:**
- Access via desktop browser at the main URL
- Can create jobs, manage customers, assign technicians
- Uses Replit Auth (login with Replit account)

**Field Technicians:**
- Access via mobile browser or PWA (Add to Home Screen)
- Automatically routed to mobile interface
- View assigned jobs, update status, capture photos

### Adding Initial Data

After setup, help the client add:

1. **Technicians** - Go to Technicians page → Add New
   - Name, phone, email, specialties
   
2. **Customers** - Go to Customers page → Add New
   - Name, address, phone, email
   
3. **First Job** - Go to Jobs page → Create Job
   - Select customer, technician, date/time, service type

---

## Mobile App Installation (PWA)

### For Technicians (iPhone)

1. Open Safari → Go to your published URL
2. Tap Share button → "Add to Home Screen"
3. Name it (e.g., "Acme Jobs")
4. Tap Add

### For Technicians (Android)

1. Open Chrome → Go to your published URL
2. Tap menu (⋮) → "Install app" or "Add to Home Screen"
3. Confirm installation

The app now works like a native app with offline support.

---

## Stripe Payment Setup (Optional)

To enable invoice payments:

1. In your forked project, open the Integrations panel
2. Search for "Stripe"
3. Click "Connect" and follow the Stripe setup wizard
4. Once connected, invoices can accept card payments

---

## GPS Tracking Setup

GPS tracking works automatically:

1. When technicians use the mobile app, their location updates every 30 seconds
2. Dispatch staff can view the **Live Map** in the desktop dashboard
3. Shows real-time technician positions and current job assignments

Note: Technicians must grant location permission when prompted.

---

## Customization Options

### Colors/Branding

To change the primary color, edit `client/src/index.css`:
- Find the `--primary` color variable
- Change to your client's brand color (use HSL format)

### Logo

Replace the text logo with an image:
1. Upload logo to `client/public/` folder
2. Edit `Layout.tsx` to use `<img>` instead of text

---

## Support & Maintenance

### Database Backups

Replit automatically backs up databases. Clients can also:
- Use the Database panel to export data
- Set up external backup integrations

### Updates

To push updates to all clients:
1. Make changes in the master project
2. Each client fork can pull updates via Git

### Monitoring

Check the **Logs** tab for:
- Server errors
- API usage
- Performance metrics

---

## Checklist for New Client

- [ ] Fork project with client name
- [ ] Set VITE_COMPANY_NAME
- [ ] Set VITE_SUPPORT_EMAIL
- [ ] Set COMPANY_NAME
- [ ] Run `npm run db:push`
- [ ] Publish the app
- [ ] Add first technician
- [ ] Add first customer
- [ ] Create test job
- [ ] Install PWA on test phone
- [ ] Verify mobile flow works
- [ ] Train client on dashboard
- [ ] (Optional) Connect Stripe for payments

---

## Troubleshooting

**"Database connection failed"**
- Refresh the page, database auto-reconnects

**Technician can't see jobs**
- Check they're logged in
- Verify jobs are assigned to them

**Photos not uploading**
- Check Object Storage is configured
- Verify file size under 10MB

**Login not working**
- Clear browser cache
- Use private/incognito window

---

## Pricing Notes

Each client deployment costs:
- **Replit Core**: ~$25/month includes compute, database, storage
- **Autoscale**: Pay-per-use based on traffic
- **Stripe**: 2.9% + 30¢ per transaction (if using payments)

For high-volume clients, consider Reserved VM deployment for predictable costs.
