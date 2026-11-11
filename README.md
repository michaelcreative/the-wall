# The Wall

A small public website where anyone who knows the PIN can leave a note and a photo. There is no account or email sign-in.

The PIN is checked in the browser. It is not a real secret. Anyone who can read the page source can find a way in.

## Local preview

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Publish on GitHub Pages

1. Create an empty public GitHub repository.
2. Push this folder to the repository's default branch.
3. In the repository, open Settings, then Pages, and set the source to the default branch, root folder (`/`).
4. The site URL will be `https://<you>.github.io/<repo>/`.

GitHub Pages is a static host. Posts are shared across visitors only after you add the Supabase backend below. Until then, each browser keeps its own notes.

## Share posts with Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run `supabase.sql`.
3. Copy the project URL and the `anon` public key from Project Settings, API.
4. Put them in `config.js`, like `config.example.js`.
5. Commit and push `config.js`.

The anon key is meant to be public, but anyone who finds it can read and add posts through the API. The PIN does not protect the database. Use this only for a small trusted wall, and do not store private or sensitive photos.

## PIN

The expected PIN is `970630`. To change it, replace the SHA-256 hash in `app.js` with the hash of your new 6-digit PIN.
