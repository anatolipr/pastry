# Testing this app

Do not launch or drive this app with Playwright (`_electron`, the `run` skill's
Electron driver pattern, etc.) unless the user has explicitly confirmed it first.
This is a native macOS menu-bar app — prefer `npm start` and ask the user to
interact with it themselves, or get explicit sign-off before automating UI
interaction against it.
