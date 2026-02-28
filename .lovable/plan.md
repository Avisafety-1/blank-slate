

## Problem

The "Legg til i kalender" button in the email uses a `webcal://` protocol URL. Most email clients (Gmail, Outlook web, Apple Mail) strip or block non-http(s) links, making the button unclickable.

## Solution

Change the email to use the regular `https://` URL for the main button and the manual copy section. Add the `webcal://` link as a secondary option with a note that it works best when opened from a phone/desktop mail client.

### Changes to `supabase/functions/send-calendar-link/index.ts`

1. Change the main "Legg til i kalender" button `href` from `webcalUrl` to the regular `feedUrl` (https)
2. Add a secondary row mentioning the `webcal://` link for users on native mail apps
3. Keep the manual URL section with the `https://` feed URL as-is

This ensures the button is always clickable in all email clients. Users can copy the https URL and paste it into their calendar app's "subscribe from URL" feature.

