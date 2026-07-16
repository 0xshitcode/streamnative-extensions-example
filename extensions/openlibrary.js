// openlibrary.js
// Real-network extension that scrapes the Open Library public API to
// demonstrate the http.get() binding, pagination, error handling, and
// mapping arbitrary JSON to StreamNative's SearchResult / LoadResponse
// shapes. Not a real streaming source — the "Play" button opens the
// Mux HLS test asset as a stand-in so the pipeline works end-to-end.
//
// Open Library API docs: https://openlibrary.org/developers/api

const metadata = {
  name: "Open Library",
  description: "Live search against the Open Library API. Demonstrates the http.get() binding, pagination, and JSON→SearchResult mapping.",
  language: "en",
  authors: ["StreamNative"],
  status: 1,
  tvTypes: ["Documentary", "Other"],
  iconUrl: "https://openlibrary.org/static/images/openlibrary-logo-tighter.svg",
  version: 1
};

var API = "https://openlibrary.org";
// Fallback stream for the demo — Open Library is books, not video.
var FALLBACK_HLS = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

function coverUrl(coverId, size) {
  if (!coverId) return null;
  return "https://covers.openlibrary.org/b/id/" + coverId + "-" + (size || "L") + ".jpg";
}

function docToSearchResult(doc) {
  return {
    title: doc.title || "Untitled",
    image: coverUrl(doc.cover_i, "L"),
    backdrop: coverUrl(doc.cover_i, "L"),
    url: "openlibrary://" + doc.key, // e.g. "/works/OL45804W"
    plot: (doc.author_name && doc.author_name.length > 0)
      ? "By " + doc.author_name.join(", ")
      : null,
    year: doc.first_publish_year || null,
    tvType: "Documentary",
    streamUrl: FALLBACK_HLS
  };
}

// ── home() : featured "subjects" as rails ──────────────────────────────
function fetchSubject(subjectSlug, subjectName) {
  var url = API + "/subjects/" + subjectSlug + ".json?limit=12";
  var r = http.get(url);
  if (r.status !== 200) {
    throw new Error("Open Library HTTP " + r.status + " for " + subjectSlug);
  }
  var data = JSON.parse(r.body);
  var items = (data.works || []).map(function (w) {
    return {
      title: w.title,
      image: coverUrl(w.cover_id, "L"),
      backdrop: coverUrl(w.cover_id, "L"),
      url: "openlibrary://" + w.key,
      plot: w.authors && w.authors.length > 0
        ? "By " + w.authors.map(function (a) { return a.name; }).join(", ")
        : null,
      year: w.first_publish_year || null,
      tvType: "Documentary",
      streamUrl: FALLBACK_HLS
    };
  });
  return { name: subjectName, items: items };
}

function home() {
  var rails = [];
  var subjects = [
    ["science_fiction", "Science Fiction"],
    ["fantasy",         "Fantasy"],
    ["mystery_and_detective_stories", "Mystery"]
  ];
  for (var i = 0; i < subjects.length; i++) {
    try {
      rails.push(fetchSubject(subjects[i][0], subjects[i][1]));
    } catch (e) {
      console.log("openlibrary home rail failed:", subjects[i][0], String(e));
    }
  }
  return rails;
}

// ── search(query) ──────────────────────────────────────────────────────
function search(query) {
  var q = (query || "").trim();
  if (q.length === 0) return [];
  var url = API + "/search.json?q=" + encodeURIComponent(q) + "&limit=20";
  var r = http.get(url);
  if (r.status !== 200) {
    throw new Error("Open Library search HTTP " + r.status);
  }
  var data = JSON.parse(r.body);
  return (data.docs || []).map(docToSearchResult);
}

// ── load(url) ──────────────────────────────────────────────────────────
function load(url) {
  var workKey = url.replace("openlibrary://", ""); // e.g. "/works/OL45804W"
  var r = http.get(API + workKey + ".json");
  if (r.status !== 200) {
    throw new Error("Open Library load HTTP " + r.status + " for " + workKey);
  }
  var data = JSON.parse(r.body);
  var descriptionText = "";
  if (typeof data.description === "string") descriptionText = data.description;
  else if (data.description && data.description.value) descriptionText = data.description.value;
  var cover = data.covers && data.covers[0];
  var year = null;
  if (data.first_publish_date) {
    var m = data.first_publish_date.match(/(\d{4})/);
    if (m) year = parseInt(m[1], 10);
  }
  return {
    title: data.title || "Untitled",
    url: url,
    tvType: "Documentary",
    image:    coverUrl(cover, "L"),
    backdrop: coverUrl(cover, "L"),
    plot: descriptionText || null,
    year: year,
    tags: (data.subjects || []).slice(0, 8),
    rating: null,
    durationMinutes: null,
    trailerUrl: null,
    streamUrl: FALLBACK_HLS
  };
}

// ── loadLinks(url) ─────────────────────────────────────────────────────
// Not really applicable for a book API. Return the fallback so Play works.
function loadLinks(url) {
  return [
    { name: "Fallback demo stream", url: FALLBACK_HLS, isM3u8: true, quality: "auto" }
  ];
}
