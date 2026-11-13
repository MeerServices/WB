# WB Werkbonnen

Werkbonnen uit MSWMenuX invullen op telefoon, tablet of laptop en door de klant laten tekenen.

App-adres: **https://meerservices.github.io/WB-werkbonnen/**

## Hoe het werkt

1. MSWMenuX zet een werkbon als PDF in Google Drive › **Werkbonnen › Open**.
2. In de app kies je **Bonnen ophalen uit Drive**. De bon verschijnt onder **Open**.
3. De medewerker vult voorbereiding, reis- en werktijden, kilometers, werkzaamheden, foto's, taken en materialen in. De kosten worden berekend met de tarieven onder ⋯.
4. De klant tekent op het scherm. De getekende PDF komt in **Werkbonnen › Getekend**.

Alles wat je invult staat eerst op het apparaat zelf en gaat daarna naar de map **Werkbonnen › WB-data** in Google Drive. Zonder internet kun je doorwerken; zodra er weer verbinding is gaat het vanzelf naar Drive. Iedereen die met de map werkt ziet dezelfde bonnen.

## Installeren als app

- **iPhone/iPad:** open het app-adres in Safari, tik op Delen › **Zet op beginscherm**.
- **Android:** open het adres in Chrome, tik op ⋮ › **App installeren**.
- **Windows/Mac:** open het adres in Chrome of Edge en klik op het installeer-icoon in de adresbalk.

## Instellen

Zie [KOPPELINGEN.md](KOPPELINGEN.md) voor de Google-client-ID en het delen van de map.

## Bestanden

| Bestand | Wat |
|---|---|
| `index.html`, `style.css` | Scherm en opmaak |
| `app.js` | Werkbonnen: inlezen, invullen, kosten, tekenen, PDF maken, rechten, log |
| `drive.js` | Google-login, opslag op het apparaat en in Google Drive |
| `config.js` | Client-ID en map-ID |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installeerbare app, werkt ook offline |
| `vendor/` | pdf.js 3.11.174 en pdf-lib 1.17.1 |

Elke push naar `main` zet de app via GitHub Actions online op GitHub Pages.
