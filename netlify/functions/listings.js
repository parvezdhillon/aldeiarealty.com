// Aldeia Realty — Inmovilla listings function
// Pulls live property listings from the Inmovilla CRM API and returns
// normalized JSON for the properties pages (EN + PT).
//
// CONFIGURATION (Netlify dashboard → Site settings → Environment variables):
//   INMOVILLA_AGENCY    — agency number (Aldeia = 14306)
//   INMOVILLA_PASSWORD  — API password (from Inmovilla's credentials pack)
//   INMOVILLA_API_URL   — API endpoint. Default below is the classic apiweb
//                         endpoint; adjust per the docs pack if different.
//   INMOVILLA_PROTOCOL  — "apiweb" (classic, default) or "v1" (JSON API)
//   INMOVILLA_LANG_EN   — Inmovilla language code for English (default 2)
//   INMOVILLA_LANG_PT   — Inmovilla language code for Portuguese (default 9)
//
// NOTE: request/response details to be FINALIZED against Inmovilla's official
// documentation pack (ticket 636395). The normalizer below is deliberately
// tolerant so adapting to the real payload is a small, contained change.
// Until credentials are set, this function returns {listings: []} and the
// website keeps showing its static content — safe to deploy at any time.

const DEFAULTS = {
  API_URL: "https://apiweb.inmovilla.com/apiweb/apiweb.php",
  V1_URL: "https://api.inmovilla.com/v1",
  LANG_EN: "2",
  LANG_PT: "9",
};

exports.handler = async function (event) {
  const agency = process.env.INMOVILLA_AGENCY;
  const password = process.env.INMOVILLA_PASSWORD;
  const protocol = (process.env.INMOVILLA_PROTOCOL || "apiweb").toLowerCase();
  const lang =
    (event.queryStringParameters && event.queryStringParameters.lang) === "pt"
      ? process.env.INMOVILLA_LANG_PT || DEFAULTS.LANG_PT
      : process.env.INMOVILLA_LANG_EN || DEFAULTS.LANG_EN;

  const respond = (obj, status = 200) => ({
    statusCode: status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(obj),
  });

  // No credentials configured yet → graceful empty (site shows static content).
  if (!agency || !password) {
    return respond({ listings: [], note: "credentials not configured" });
  }

  try {
    let raw;
    if (protocol === "v1") {
      const url = (process.env.INMOVILLA_API_URL || DEFAULTS.V1_URL) + "/properties";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numagencia: Number(agency),
          password: password,
          idioma: Number(lang),
          posinicial: 1,
          numelementos: 50,
        }),
      });
      raw = await res.json();
    } else {
      // Classic apiweb protocol: semicolon-packed param string.
      // Format per Inmovilla web-integration docs (finalize with docs pack):
      //   numagencia;password;idioma;json  +  peticion "paginacion;start;count;where;order"
      const url = process.env.INMOVILLA_API_URL || DEFAULTS.API_URL;
      const body = new URLSearchParams();
      body.set("param", `${agency};${password};${lang};json`);
      body.set("peticion", "paginacion;1;50;;");
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const text = await res.text();
      try {
        raw = JSON.parse(text);
      } catch {
        raw = { _raw: text };
      }
    }

    return respond({ listings: normalize(raw) });
  } catch (err) {
    // Never break the page — return empty on any failure.
    return respond({ listings: [], error: String(err && err.message) }, 200);
  }
};

// ---------------------------------------------------------------------------
// Tolerant normalizer: finds the array of property-like objects wherever the
// API nests it, and maps varied field names onto one stable shape.
// ---------------------------------------------------------------------------
function normalize(raw) {
  const arr = findPropertyArray(raw);
  if (!arr) return [];
  return arr.map(toListing).filter(Boolean);
}

function findPropertyArray(node, depth = 0) {
  if (!node || depth > 4) return null;
  if (Array.isArray(node)) {
    const objs = node.filter((x) => x && typeof x === "object");
    if (objs.length && objs.some(looksLikeProperty)) return objs;
    for (const child of node) {
      const found = findPropertyArray(child, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node === "object") {
    for (const key of Object.keys(node)) {
      const found = findPropertyArray(node[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function looksLikeProperty(o) {
  const keys = Object.keys(o).map((k) => k.toLowerCase());
  const signals = ["ref", "referencia", "cod_ofer", "precioinmo", "precioalq", "precio", "tipo_ofer", "foto", "fotos", "poblacion", "ciudad"];
  return signals.filter((s) => keys.some((k) => k.includes(s))).length >= 2;
}

function pick(o, names) {
  for (const n of names) {
    for (const k of Object.keys(o)) {
      if (k.toLowerCase() === n) {
        const v = o[k];
        if (v !== undefined && v !== null && String(v).trim() !== "" && String(v) !== "0") return v;
      }
    }
  }
  return null;
}

function toListing(o) {
  if (!o || typeof o !== "object") return null;
  const salePrice = Number(pick(o, ["precioinmo", "precioventa", "precio"])) || 0;
  const rentPrice = Number(pick(o, ["precioalq", "precioalquiler"])) || 0;
  const forRent = rentPrice > 0 && salePrice === 0;
  const price = forRent ? rentPrice : salePrice || rentPrice;
  const photo =
    pick(o, ["foto", "foto1", "imagen", "fotourl"]) ||
    (Array.isArray(o.fotos) && o.fotos.length ? (o.fotos[0].url || o.fotos[0]) : null);
  return {
    ref: String(pick(o, ["ref", "referencia", "cod_ofer", "id"]) || ""),
    title: String(pick(o, ["titulo", "title", "nbtipo", "tipo"]) || "Property"),
    description: String(pick(o, ["descrip", "descripcion", "description"]) || "").slice(0, 220),
    location: String(pick(o, ["poblacion", "ciudad", "zona", "localidad"]) || "Silver Coast"),
    operation: forRent ? "rent" : "sale",
    price: price,
    priceLabel: price
      ? "€" + Math.round(price).toLocaleString("en-US") + (forRent ? "/mo" : "")
      : "",
    image: photo ? String(photo) : null,
    bedrooms: Number(pick(o, ["habitaciones", "habdobles", "dormitorios"])) || null,
    bathrooms: Number(pick(o, ["banyos", "banos"])) || null,
    area: Number(pick(o, ["m_cons", "metros", "superficie"])) || null,
  };
}
