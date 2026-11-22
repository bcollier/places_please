# App Specification


## Overview

This app has games and techniques for memorizing lines of a script.

## Core Features

<!-- List the main features of the app. -->

- Take a series of pictures of a script, or upload a PDF / Word document containing the script
- Rehearse lines with an AI partner
- The app should recognize when your line is word perfect (celbrate ding), a little off but correct (antoher sound) or incorrect (halting sound). 
- The app should run lines, reading the parts of your partner in the scene and then pausing while you say your line.
- The app should also contain a "warm up game" where they are shown one of their partners lines and they have to choose it with multiple choice the correct line.
- There should also be a listen mode, where the user can just listen to the two have the dialogue to help learn the lines.


## User Roles

No admin needed, just standard user role.

## Screens & Navigation

<!-- Describe the main screens and how users navigate between them. -->

| Screen | Purpose | Navigation |
|--------|---------|------------|
| Home       | Overview, and select practice lines or a warm up flashcards style        | practice lines with AI, flash cards, or listen to a script           | 

## Data Model

Store all persistent data in a database on supabase. I already have an account.

### Entities

- user
- script
- practice_history

## API & Backend

- backend postgress or mysql database on supabase
- calling openrouter for AI API calls

## Design & Branding

- Clean beautiful typography
- Use Carnegie Mellon colors

## Platform Targets

- [X ] iOS
- [ ] Android
- [ ] Web

## Notifications & Background Tasks

The user should be able to listen to the app and practice with the screen off while walking

## Offline Behavior

This app relies on API's for intelligence and can't be used offline.

## Analytics & Monitoring

- Log all calls to OpenRouter to the database, including all costs in a database

## Constraints & Non-Goals

- The app should be dead simple to use and unbreakable. I don't want to be working through bugs while practicing lines.

## Open Questions

- I may want to add more line memorization exercises over time.