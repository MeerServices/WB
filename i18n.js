/* Werkbonnen — taal: Nederlands (standaard) of English (US), net als BB.
 * In het Engels vertaalt de app het hele scherm, ook teksten die later verschijnen.
 * De getekende PDF blijft Nederlands (die gaat naar de klant, op de bon uit MSWMenuX).
 * Nieuwe teksten: voeg de Nederlandse tekst met vertaling toe aan EN, of een regel aan PATTERNS. */
(() => {
  "use strict";
  let lang = "nl";
  try { lang = localStorage.getItem("wb-lang") || "nl"; } catch (e) {}
  if (lang !== "en") lang = "nl";

  const EN = {
    // login en kop
    "Log in met het Google-account waarmee de map Werkbonnen met je gedeeld is.": "Sign in with the Google account the Werkbonnen folder is shared with.",
    "Inloggen met Google": "Sign in with Google", "Opnieuw inloggen": "Sign in again",
    "Je Google-login is verlopen. Je werk staat veilig op dit apparaat.": "Your Google sign-in has expired. Your work is safe on this device.",
    "Uit MSWMenuX, via Google Drive › Werkbonnen › Open": "From MSWMenuX, via Google Drive › Werkbonnen › Open",
    "Uitloggen": "Sign out", "Uitleg over de app": "About the app", "Taal": "Language",
    "Nog niet ingesteld.": "Not set up yet.",
    "Vul in": "Fill in", "de Google-client-ID en de map Werkbonnen in. Hoe dat gaat staat in KOPPELINGEN.md.": "the Google client ID and the Werkbonnen folder. KOPPELINGEN.md explains how.",
    "De map Werkbonnen is niet gevonden of niet met je gedeeld.": "The Werkbonnen folder was not found or is not shared with you.",
    "Vraag Martin om de map Werkbonnen in Google Drive met je Google-account te delen, als Bewerker.": "Ask Martin to share the Werkbonnen folder in Google Drive with your Google account, as Editor.",
    "Google Drive weigert de toegang.": "Google Drive denied access.",
    "Inloggen is niet gelukt.": "Sign-in failed.",
    "Probeer het opnieuw. Werkt het niet, vraag Martin of je Google-account is toegevoegd.": "Please try again. If it still fails, ask Martin whether your Google account has been added.",
    "Opnieuw inloggen nodig": "Sign in again", "Offline": "Offline",
    // lijst
    "Bonnen ophalen uit Drive": "Fetch work orders from Drive", "Ophalen…": "Fetching…",
    "Open": "Open", "Getekend": "Signed", "Filter": "Filter",
    "Zoek op nummer, klant of medewerker": "Search by number, customer or employee", "Zoeken": "Search",
    "Werkbonnen laden…": "Loading work orders…",
    "Zet een werkbon vanuit MSWMenuX als PDF in de Drive-map": "Save a work order from MSWMenuX as a PDF in the Drive folder",
    "en kies": "and choose", ". Getekende bonnen komen als PDF in": ". Signed work orders are saved as PDF in",
    "Geen nieuwe bonnen in de map Open.": "No new work orders in the Open folder.",
    "Niet gelukt:": "Failed:", "leeg bestand": "empty file",
    "In Drive": "In Drive", "Wacht op upload": "Waiting for upload", "Bezig": "In progress", "Nieuw": "New",
    "Geen bonnen gevonden voor deze zoekopdracht.": "No work orders match this search.",
    "Geen open bonnen. Zet een PDF uit MSWMenuX in de map Werkbonnen/Open en kies Bonnen ophalen uit Drive.": "No open work orders. Put a PDF from MSWMenuX in the Werkbonnen/Open folder and choose Fetch work orders from Drive.",
    "Nog geen getekende bonnen.": "No signed work orders yet.", "Onbekende klant": "Unknown customer",
    "De app kon niet starten. Ververs de pagina.": "The app couldn't start. Please refresh the page.",
    "Log in met je Google-account om de werkbonnen te zien.": "Sign in with your Google account to see the work orders.",
    "De werkbonnen konden niet geladen worden. Ververs de pagina.": "The work orders couldn't be loaded. Please refresh the page.",
    "Ingelogd als": "Signed in as",
    // bon
    "Werkbon": "Work order", "Alle bonnen": "All work orders", "Origineel uit MSWMenuX bekijken": "View original from MSWMenuX",
    "Debiteurnr.": "Customer no.", "Tarief ex. btw": "Rate excl. VAT", "Klant": "Customer", "Bezoekadres": "Visit address", "Telefoon": "Phone",
    "Opdracht": "Assignment", "Reden": "Reason", "Afgesproken met": "Arranged with", "Medewerker": "Employee", "Servicecontract": "Service contract",
    "Objectnr.": "Object no.", "Projectnr.": "Project no.", "Gepland": "Planned",
    "(uit tarieventabel)": "(from rate table)", "leeg, vul tarieven in via het tandwiel": "empty, set rates via the gear icon",
    "Reizen en werktijden": "Travel and working hours", "Tik op Nu om de huidige tijd in te vullen": "Tap Now to fill in the current time",
    "Voorbereiding": "Preparation", "telt als werkuren": "counts as working hours", "Van": "From", "Nu": "Now", "Tot": "To",
    "Heenreis": "Outbound trip", "reisuren": "travel hours", "Op locatie": "On site", "aankomst en vertrek": "arrival and departure",
    "Aankomst": "Arrival", "Vertrek": "Departure", "Terugreis": "Return trip", "Reisuren": "Travel hours", "Werkuren": "Working hours",
    "Route naar de klant": "Route to the customer", "Route en reistijd": "Route and travel time",
    "Opent Google Maps met de route naar het bezoekadres. Neem daar het aantal kilometers over.": "Opens Google Maps with the route to the visit address. Copy the distance from there.",
    "Vertrekadres (leeg = je huidige locatie)": "Start address (empty = your current location)",
    "Km heenreis": "Km outbound", "Km terugreis": "Km return", "Totaal km": "Total km", "zelfde als heen": "same as outbound",
    "Uren en bedragen": "Hours and amounts", "Ex. btw. Alles is per bon aan te passen;": "Excl. VAT. Everything can be adjusted per work order;",
    "zet terug naar berekend.": "resets to calculated.", "Ex. btw. Alles is per bon aan te passen; ↺ zet terug naar berekend.": "Excl. VAT. Everything can be adjusted per work order; ↺ resets to calculated.",
    "Uurtarief van medewerker": "Employee hourly rate", "Aantal": "Quantity", "Tarief €": "Rate €", "Bedrag": "Amount",
    "Reistijd": "Travel time", "Kilometers": "Kilometers", "Overig": "Other", "materiaal, parkeren": "materials, parking",
    "Korting": "Discount", "Subtotaal": "Subtotal", "Totaal ex. btw": "Total excl. VAT", "Totaal incl. btw": "Total incl. VAT", "Btw": "VAT",
    "Standaard uurtarief": "Default hourly rate",
    "Werkuren aantal": "Working hours quantity", "Uurtarief": "Hourly rate", "Werkuren terugzetten naar berekend": "Reset working hours to calculated",
    "Reisuren aantal": "Travel hours quantity", "Reisuurtarief": "Travel hourly rate", "Reistijd terugzetten naar berekend": "Reset travel time to calculated",
    "Aantal kilometers": "Number of kilometers", "Kilometertarief": "Rate per km", "Kilometers terugzetten naar berekend": "Reset kilometers to calculated",
    "Omschrijving": "Description", "Omschrijving overige kosten": "Description of other costs", "Bedrag overige kosten": "Amount of other costs", "Soort korting": "Discount type",
    "Werkzaamheden": "Work performed", "De tekst uit MSWMenuX blijft staan, jouw tekst komt eronder": "The text from MSWMenuX stays; your text goes below it",
    "Constatering": "Findings", "Oplossing": "Solution", "Wat heb je aangetroffen?": "What did you find?", "Wat heb je gedaan?": "What did you do?",
    "Foto's": "Photos", "Foto maken": "Take photo", "Kies uit galerij": "Choose from gallery", "Komen als bijlage in de PDF": "Added as attachment to the PDF",
    "Foto opslaan…": "Saving photo…", "Foto verwijderen": "Delete photo", "Foto vergroot": "Enlarged photo",
    "Dit bestand is geen leesbare foto": "This file is not a readable photo", "Niet toegevoegd:": "Not added:",
    ". Een foto toevoegen lukt alleen met internet.": ". Adding a photo only works with an internet connection.",
    "Deze foto verwijderen? Dat kan niet ongedaan worden gemaakt.": "Delete this photo? This cannot be undone.",
    "Nog in te plannen taken": "Tasks still to schedule", "Toevoegen": "Add", "Geen taken.": "No tasks.", "Taak verwijderen": "Delete task",
    "Nieuwe taak, bijvoorbeeld: switch vervangen": "New task, for example: replace switch",
    "Materialen en onkosten": "Materials and expenses", "Alleen invullen als het van toepassing is": "Only fill in if applicable",
    "Geleverde of ingenomen goederen": "Goods supplied or taken back", "Onkosten": "Expenses",
    "Bijv. 1x patchkabel 2m": "E.g. 1x patch cable 2m", "Bijv. parkeren € 4,50": "E.g. parking € 4.50",
    "Opslaan…": "Saving…", "Niet opgeslagen": "Not saved", "Bewaard op dit apparaat, nog niet online": "Stored on this device, not online yet",
    "Je kunt deze bon niet wijzigen.": "You can't change this work order.",
    "Wijzigingen die nog op dit apparaat stonden zijn teruggezet en opgeslagen.": "Changes that were still on this device have been restored and saved.",
    "Voorbeeld kan niet getoond worden.": "Preview can't be shown.", "Laden…": "Loading…",
    // tekenen
    "Aftekenen door de klant": "Customer sign-off",
    "Hierbij verklaart opdrachtgever de geleverde apparatuur, diensten & software naar volledige tevredenheid te hebben ontvangen en het factuurbedrag binnen 8 dagen na factuurdatum te voldoen. Minimaal wordt 1 uur in rekening gebracht.":
      "The client hereby declares to have received the supplied equipment, services & software to full satisfaction and to pay the invoice amount within 8 days of the invoice date. A minimum of 1 hour is charged.",
    "Je hebt alleen leesrechten. Vraag een admin om je rechten als je bonnen wilt invullen of laten tekenen.": "You have read-only access. Ask an admin for rights if you want to fill in or have work orders signed.",
    "Naam in blokletters": "Name in capitals", "Datum": "Date", "Handtekening klant": "Customer signature", "Teken hier met je vinger of muis": "Sign here with your finger or mouse",
    "Wis": "Clear", "Ondertekenen en PDF maken": "Sign and create PDF", "Opnieuw naar Drive sturen": "Send to Drive again",
    "Openen in Google Drive": "Open in Google Drive", "PDF opslaan": "Save PDF", "Bon weer openzetten": "Reopen work order",
    "De handtekening wordt gewist. Doorgaan?": "The signature will be erased. Continue?", "Ja, openzetten": "Yes, reopen", "Nee": "No",
    "Ondertekenen lukt nog niet:": "Can't sign yet:", "vul de": "enter the", "naam van de klant": "customer's name",
    "in blokletters in en laat de klant": "in capitals and have the customer", "in blokletters in": "in capitals", "in blokletters in.": "in capitals.", "in blokletters in en": "in capitals and",
    "laat de klant": "have the customer", "tekenen": "sign", "in het vak Handtekening klant.": "in the Customer signature box.",
    "PDF maken…": "Creating PDF…", "Ondertekenen lukte niet.": "Signing failed.", "Je hebt geen rechten om deze bon op te slaan.": "You don't have rights to save this work order.",
    "Probeer het opnieuw.": "Please try again.", "Getekend en bewaard.": "Signed and saved.",
    "Opslaan in Google Drive…": "Saving to Google Drive…", "Werkbon naar Google Drive sturen…": "Sending work order to Google Drive…",
    "Klaar.": "Done.", "De getekende werkbon staat in Google Drive › Werkbonnen › Getekend.": "The signed work order is in Google Drive › Werkbonnen › Signed (Getekend).",
    "De getekende werkbon staat in Google Drive › Werkbonnen › Getekend, de foto's in een apart bestand ernaast.": "The signed work order is in Google Drive › Werkbonnen › Getekend, with the photos in a separate file next to it.",
    "De PDF is te groot voor Google Drive.": "The PDF is too large for Google Drive.",
    "Verwijder een paar foto's en kies Opnieuw naar Drive sturen.": "Remove a few photos and choose Send to Drive again.",
    "Getekend en bewaard, maar nog niet (helemaal) in Google Drive.": "Signed and saved, but not (fully) in Google Drive yet.",
    "Kies daarna Opnieuw naar Drive sturen.": "Then choose Send to Drive again.",
    "Opgeslagen in Werkbonnen/Getekend": "Saved in Werkbonnen/Getekend", "Nog niet in Google Drive": "Not in Google Drive yet",
    // fouten Drive
    "Je Google-login is verlopen.": "Your Google sign-in has expired.", "Kies bovenaan Opnieuw inloggen.": "Choose Sign in again at the top.",
    "Geen internet.": "No internet.", "Je werk staat veilig op dit apparaat en gaat naar Drive zodra er weer verbinding is.": "Your work is safe on this device and goes to Drive once you're back online.",
    "Je hebt geen toegang tot deze Drive-map.": "You don't have access to this Drive folder.",
    "Vraag de beheerder om de map Werkbonnen met je te delen (als Bewerker).": "Ask the administrator to share the Werkbonnen folder with you (as Editor).",
    "Bestand of map niet gevonden in Drive.": "File or folder not found in Drive.", "Misschien is het verplaatst of verwijderd.": "It may have been moved or deleted.",
    "Google Drive reageert even niet.": "Google Drive isn't responding right now.", "Probeer het over een minuut opnieuw.": "Try again in a minute.",
    "Google Drive gaf een fout:": "Google Drive returned an error:", "Google Drive is niet bereikbaar.": "Google Drive can't be reached.",
    "Log opnieuw in met je Google-account.": "Sign in again with your Google account.", "Er ging iets mis met Google Drive.": "Something went wrong with Google Drive.",
    // instellingen
    "Instellingen": "Settings", "Tarieven en rechten": "Rates and rights", "Drive-mappen": "Drive folders", "Log": "Log", "Sluiten": "Close", "Opslaan": "Save",
    "Standaard uurtarief €": "Default hourly rate €", "Reistijd per uur €": "Travel time per hour €", "Km-vergoeding per km €": "Mileage per km €", "Btw %": "VAT %",
    "Uren afronden": "Round hours", "Niet afronden": "Don't round", "Op kwartier naar boven": "Up to the quarter hour", "Op half uur naar boven": "Up to the half hour",
    "Minimaal 1 werkuur rekenen": "Charge at least 1 working hour", "Medewerkers, rechten en uurtarief": "Employees, rights and hourly rate",
    "Naam (zoals in MSWMenuX)": "Name (as in MSWMenuX)", "E-mail (Google)": "Email (Google)", "Rechten": "Rights", "Uurtarief €": "Hourly rate €",
    "Net als in de Weekplanner: je Google-account is je login en wordt herkend aan het e-mailadres (of aan de naam als er geen e-mail is ingevuld). Iedereen in de lijst moet ook toegang hebben tot de Drive-map Werkbonnen. Admin mag alles, ook tarieven, rechten, bonnen weer openzetten en de log bekijken. Gebruiker vult bonnen in en laat ze tekenen. Alleen lezen kan alleen kijken. Wie niet in de lijst staat, kan alleen lezen. Zonder eigen tarief geldt het standaard uurtarief.":
      "As in the Weekplanner: your Google account is your login and is recognized by email address (or by name if no email is filled in). Everyone on the list also needs access to the Werkbonnen Drive folder. Admin can do everything, including rates, rights, reopening work orders and viewing the log. User fills in work orders and has them signed. Read only can only view. Anyone not on the list can only view. Without their own rate, the default hourly rate applies.",
    "Admin": "Admin", "Gebruiker": "User", "Alleen lezen": "Read only", "Naam": "Name", "Naam medewerker": "Employee name", "standaard": "default",
    "Medewerker verwijderen": "Delete employee", "Verslepen (of pijltjes omhoog en omlaag)": "Drag (or arrow keys up and down)", "Sleep om de volgorde te veranderen": "Drag to change the order",
    "leeg = uurtarief": "empty = hourly rate", "bijv. 75,00": "e.g. 75.00", "bijv. 0,23": "e.g. 0.23",
    "Dit is geen geldig bedrag.": "This is not a valid amount.", "Gebruik bijvoorbeeld 75,00.": "Use for example 75,00.",
    "Je kunt je eigen adminrechten niet weghalen.": "You can't remove your own admin rights.", "Laat dat een andere admin doen.": "Ask another admin to do that.",
    "Opslaan geweigerd.": "Saving refused.", "Je hebt geen schrijfrechten op de Drive-map Werkbonnen. Vraag Martin om je daar Bewerker te maken.": "You don't have write access to the Werkbonnen Drive folder. Ask Martin to make you an Editor there.",
    "Opslaan lukte niet.": "Saving failed.", "Controleer je internetverbinding en probeer het opnieuw.": "Check your internet connection and try again.",
    "De map Werkbonnen in Google Drive. Tik op een map om hem te openen, op een bestand om het in Drive te bekijken.": "The Werkbonnen folder in Google Drive. Tap a folder to open it, or a file to view it in Drive.",
    "Vernieuwen": "Refresh", "Lege map": "Empty folder", "getekende bon": "signed work order", "in app: getekend": "in app: signed", "in app: open": "in app: open",
    "Wie wat gedaan heeft met de werkbonnen en instellingen, de afgelopen 90 dagen, nieuwste bovenaan.": "Who did what with the work orders and settings over the last 90 days, newest first.",
    "Wanneer": "When", "Wie": "Who", "Wat": "What", "Bon": "Work order", "Details": "Details", "Nog niets gelogd.": "Nothing logged yet.",
    "Zoek op naam, bon of actie": "Search by name, work order or action", "Zoek in log": "Search log",
    "Ingelezen uit Drive": "Imported from Drive", "Aangepast": "Changed", "Ondertekend": "Signed", "Naar Drive gestuurd": "Sent to Drive",
    "Instellingen aangepast": "Settings changed", "Weer opengezet": "Reopened",
    // vragen en lightbox
    "Weet u het zeker?": "Are you sure?", "Nee, terug": "No, go back", "Ja, verwijderen": "Yes, delete",
    "Uitloggen op dit apparaat? Wat nog niet in Drive staat blijft hier bewaard tot je weer inlogt.": "Sign out on this device? Anything not yet in Drive stays here until you sign in again.",
    "Passend": "Fit", "Uitzoomen": "Zoom out", "Inzoomen": "Zoom in",
  };

  const PATTERNS = [
    [/^(\d+) nieuwe bon ingelezen\.$/, "$1 new work order imported."], [/^(\d+) nieuwe bonnen ingelezen\.$/, "$1 new work orders imported."],
    [/^Inlezen (\d+) van (\d+)…$/, "Reading $1 of $2…"],
    [/^Opgeslagen om (.+)$/, "Saved at $1"], [/^Getekend op (.+)$/, "Signed on $1"], [/ · getekend (\S+)$/, " · signed $1"],
    [/^(\d+) wijziging wacht op (Drive|internet)$/, (m, n, w) => `${n} change waiting for ${w === "Drive" ? "Drive" : "internet"}`],
    [/^(\d+) wijzigingen wachten op (Drive|internet)$/, (m, n, w) => `${n} changes waiting for ${w === "Drive" ? "Drive" : "internet"}`],
    [/^(\d+) foto, komen als bijlage in de PDF$/, "$1 photo, added as attachment to the PDF"], [/^(\d+) foto's, komen als bijlage in de PDF$/, "$1 photos, added as attachment to the PDF"],
    [/^berekend (.+) u$/, "calculated $1 h"], [/^berekend (.+) km$/, "calculated $1 km"],
    [/^Foto (\d+) van (\d+) verwerken…$/, "Processing photo $1 of $2…"], [/^Foto verwerken…$/, "Processing photo…"],
    [/^Foto's naar Google Drive sturen \((\d+) van (\d+)\)…$/, "Sending photos to Google Drive ($1 of $2)…"],
    [/^Taak (\d+)$/, "Task $1"], [/^Taak “(.*)” verwijderen\?$/, "Delete task “$1”?"],
    [/^(.+) uit de lijst verwijderen\? Dit wordt definitief bij Opslaan\.$/, "Remove $1 from the list? This becomes final when you save."],
    [/^\((Admin|Gebruiker|Alleen lezen)\)(.*)$/, (m, r, rest) => `(${EN[r]})` + rest.replace(" · niet als medewerker herkend, alleen lezen", " · not recognized as an employee, read only")],
    [/^(\d+):(\d\d) \((.+) u\)$/, "$1:$2 ($3 h)"], [/^Reisuren (.+)$/, "Travel hours $1"], [/^Werkuren (.+)$/, "Working hours $1"],
    [/^(.+) \(uit tarieventabel\)$/, "$1 (from rate table)"], [/^(.+) om (\d+:\d\d)$/, "$1 at $2"],
  ];

  function t(s) { return lang === "en" && Object.prototype.hasOwnProperty.call(EN, s) ? EN[s] : s; }
  function tr(s) {
    if (Object.prototype.hasOwnProperty.call(EN, s)) return EN[s];
    for (const [re, rep] of PATTERNS) if (re.test(s)) return s.replace(re, rep);
    return null;
  }

  // ---------- de pagina vertalen (alleen in het Engels) ----------
  const ATTRS = ["placeholder", "aria-label", "title", "alt"];
  const SKIP = "[data-no-i18n],script,style,textarea,svg";
  function textNode(n) {
    const raw = n.data, key = raw.trim(); if (!key) return;
    const x = tr(key); if (x != null && x !== key) n.data = raw.replace(key, x);
  }
  function element(e) {
    if (e.nodeType !== 1 || e.closest("[data-no-i18n]")) return;
    for (const a of ATTRS) if (e.hasAttribute(a)) { const v = e.getAttribute(a), x = tr(v.trim()); if (x != null && x !== v) e.setAttribute(a, x); }
  }
  const skip = (n) => n.parentElement && n.parentElement.closest(SKIP);
  function walk(root) {
    if (root.nodeType === 3) { if (!skip(root)) textNode(root); return; }
    if (root.nodeType !== 1 || /^(SCRIPT|STYLE|TEXTAREA)$/.test(root.tagName)) return;
    element(root);
    root.querySelectorAll("*").forEach(element);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (skip(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    const list = []; while (w.nextNode()) list.push(w.currentNode); list.forEach(textNode);
  }
  function start() {
    document.documentElement.lang = lang === "en" ? "en-US" : "nl";
    document.querySelectorAll(".help[lang]").forEach((h) => (h.hidden = (h.lang === "en") !== (lang === "en")));
    document.querySelectorAll("[data-lang]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
      b.addEventListener("click", () => { if (b.dataset.lang === lang) return; try { localStorage.setItem("wb-lang", b.dataset.lang); } catch (e) {} location.reload(); });
    });
    if (lang !== "en") return;
    walk(document.body);
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "characterData") { if (!skip(m.target)) textNode(m.target); }
        else if (m.type === "attributes") element(m.target);
        else m.addedNodes.forEach(walk);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();

  window.I18N = { get lang() { return lang; }, t };
})();
