const { google } = require('googleapis');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
// const credentials = require('./credentials.json');
const scopes = ['https://www.googleapis.com/auth/spreadsheets'];
const oauth2Client = new google.auth.OAuth2(
  "783755224069-kr60gn8unpe4ejf6oomns9mt14uh741b.apps.googleusercontent.com",
  "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"
//   credentials.web.redirect_uris[0]
);

google.options({ auth: oauth2Client });

app.get('/auth', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes
  });
  res.redirect(authUrl);
});

app.get('/oauth2callback', (req, res) => {
  const code = req.query.code;
  oauth2Client.getToken(code, (err, tokens) => {
    if (err) {
      console.error('Error retrieving access token', err);
      return res.status(500).send('Authentication failed');
    }
    oauth2Client.setCredentials(tokens);
    fs.writeFileSync(path.join(__dirname, 'token.json'), JSON.stringify(tokens));
    res.send('Authentication successful! You can now close this tab.');
  });
});

function updateSheet() {
  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
  const spreadsheetId = '1adMTCIkM-tglVA_yCNTEM-bsVU-eHIBy3jl68wW5isQ'; // Replace with your actual Spreadsheet ID
  const range = 'Sheet1!B25'; // Specify the cell or range, e.g., 'Sheet1!A1:C10'
  const valueInputOption = 'USER_ENTERED'; // 'RAW' for raw values, 'USER_ENTERED' for values like a user typed them

  const values = [
    ['Hello, world!'] // Data you want to write
  ];
  const resource = { values };

  sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption,
    resource,
  }, (err, result) => {
    if (err) {
      console.log('The API returned an error:', err);
      return;
    }
    console.log(`${result.data.updatedCells} cells updated.`);
  });
}

const port = 3000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
  console.log('Visit http://localhost:3000/auth to authorize the app.');
});


updateSheet();