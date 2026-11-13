# Google koppelen

Werkbonnen heeft één sleutel nodig: een Google **client-ID**. Die is niet geheim, want hij staat altijd zichtbaar in een web-app. Hij komt in `config.js`.

App-adres: `https://meerservices.github.io/WB/`

## Google: client-ID

Heb je voor BB al een project in Google Cloud, dan kun je dat project gebruiken. Volg dan alleen de stappen 2, 4, 5 en 6.

1. Ga naar [console.cloud.google.com](https://console.cloud.google.com/) en maak een nieuw project, bijvoorbeeld `Werkbonnen`.
2. Zoek **Google Drive API** op en klik op **Enable**.
3. Ga naar **Google Auth Platform** (of **OAuth consent screen**) en klik op **Get started**:
   - App-naam `Werkbonnen`, je eigen e-mailadres als contact.
   - Doelgroep: **External**.
4. Bij **Data access** voeg je de scope `https://www.googleapis.com/auth/drive` toe. Werkbonnen moet de PDF's lezen die MSWMenuX in de map zet, daarom is de gewone Drive-toegang nodig en niet alleen `drive.file`.
5. Bij **Audience** voeg je onder **Test users** het Google-account van iedere medewerker toe (tot 100). Zolang de app in de testfase staat, kan alleen wie hier staat inloggen. Google laat bij het inloggen een waarschuwing zien dat de app niet geverifieerd is: kies **Doorgaan**.
6. Ga naar **Clients** › **Create client** › **Web application**:
   - Vul bij **Authorized JavaScript origins** in: `https://meerservices.github.io`
   - Klik op **Create** en kopieer de **Client ID** (eindigt op `.apps.googleusercontent.com`).

## Invullen

Zet de client-ID in `config.js`:

```js
window.WB_CONFIG = {
  googleClientId: "1234-abc.apps.googleusercontent.com",
  driveFolderId: "1E7yKke5ui45Cw9n-_HUUfzWlByO05rdC",
};
```

`driveFolderId` is de map **Werkbonnen** in Google Drive (het laatste stuk van het adres als je de map opent).

## De map delen

Deel de map **Werkbonnen** in Google Drive met iedere medewerker, als **Bewerker**. Zonder die deling kan iemand wel inloggen, maar ziet hij of zij geen bonnen.

## Rechten in de app

De eigenaar van de map Werkbonnen is altijd **Admin**. Onder ⋯ › **Tarieven en rechten** zet de admin elke medewerker met naam, e-mailadres (het Google-account), rechten en uurtarief. Wie niet in die lijst staat, kan alleen lezen.
