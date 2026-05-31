// Census Bureau Schedule C country code → user-friendly name lookup.
// Schedule C is the official US import country classification (4-digit
// numeric codes). Authoritative source:
//   https://www.census.gov/foreign-trade/schedules/c/country.txt
//
// This map is compiled from that source as of the 2026-05-16 sync. Codes
// are organized by continent (1xxx N America, 2xxx Central America/
// Caribbean, 3xxx S America, 4xxx Europe, 5xxx Middle East/Asia,
// 6xxx Oceania, 7xxx Africa, 9xxx US territories). Unmapped codes fall
// back to "Country NNNN" via getCountryName().

const CENSUS_COUNTRIES: Record<string, string> = {
  // North America
  "1000": "United States",
  "1010": "Greenland",
  "1220": "Canada",
  "1610": "Saint Pierre and Miquelon",

  // Central America & Caribbean
  "2010": "Mexico",
  "2050": "Guatemala",
  "2080": "Belize",
  "2110": "El Salvador",
  "2150": "Honduras",
  "2190": "Nicaragua",
  "2230": "Costa Rica",
  "2250": "Panama",
  "2320": "Bermuda",
  "2360": "Bahamas",
  "2390": "Cuba",
  "2410": "Jamaica",
  "2430": "Turks and Caicos",
  "2440": "Cayman Islands",
  "2450": "Haiti",
  "2470": "Dominican Republic",
  "2481": "Anguilla",
  "2482": "British Virgin Islands",
  "2483": "Saint Kitts and Nevis",
  "2484": "Antigua and Barbuda",
  "2485": "Montserrat",
  "2486": "Dominica",
  "2487": "Saint Lucia",
  "2488": "Saint Vincent and the Grenadines",
  "2489": "Grenada",
  "2720": "Barbados",
  "2740": "Trinidad and Tobago",
  "2774": "Sint Maarten",
  "2777": "Curaçao",
  "2779": "Aruba",
  "2831": "Guadeloupe",
  "2839": "Martinique",

  // South America
  "3010": "Colombia",
  "3070": "Venezuela",
  "3120": "Guyana",
  "3150": "Suriname",
  "3170": "French Guiana",
  "3310": "Ecuador",
  "3330": "Peru",
  "3350": "Bolivia",
  "3370": "Chile",
  "3510": "Brazil",
  "3530": "Paraguay",
  "3550": "Uruguay",
  "3570": "Argentina",
  "3720": "Falkland Islands",

  // Europe
  "4000": "Iceland",
  "4010": "Sweden",
  "4031": "Svalbard and Jan Mayen",
  "4039": "Norway",
  "4050": "Finland",
  "4091": "Faroe Islands",
  "4099": "Denmark",
  "4120": "United Kingdom",
  "4190": "Ireland",
  "4210": "Netherlands",
  "4231": "Belgium",
  "4239": "Luxembourg",
  "4271": "Andorra",
  "4272": "Monaco",
  "4279": "France",
  "4280": "Germany",
  "4330": "Austria",
  "4351": "Czech Republic",
  "4359": "Slovakia",
  "4370": "Hungary",
  "4411": "Liechtenstein",
  "4419": "Switzerland",
  "4470": "Estonia",
  "4490": "Latvia",
  "4510": "Lithuania",
  "4550": "Poland",
  "4621": "Russia",
  "4622": "Belarus",
  "4623": "Ukraine",
  "4631": "Armenia",
  "4632": "Azerbaijan",
  "4633": "Georgia",
  "4634": "Kazakhstan",
  "4635": "Kyrgyzstan",
  "4641": "Moldova",
  "4642": "Tajikistan",
  "4643": "Turkmenistan",
  "4644": "Uzbekistan",
  "4700": "Spain",
  "4710": "Portugal",
  "4720": "Gibraltar",
  "4730": "Malta",
  "4751": "San Marino",
  "4752": "Holy See (Vatican)",
  "4759": "Italy",
  "4791": "Croatia",
  "4792": "Slovenia",
  "4793": "Bosnia and Herzegovina",
  "4794": "North Macedonia",
  "4801": "Serbia",
  "4803": "Kosovo",
  "4804": "Montenegro",
  "4810": "Albania",
  "4840": "Greece",
  "4850": "Romania",
  "4870": "Bulgaria",
  "4890": "Türkiye",
  "4910": "Cyprus",

  // Middle East
  "5020": "Syria",
  "5040": "Lebanon",
  "5050": "Iraq",
  "5070": "Iran",
  "5081": "Israel",
  "5082": "Gaza Strip",
  "5083": "West Bank",
  "5110": "Jordan",
  "5130": "Kuwait",
  "5170": "Saudi Arabia",
  "5180": "Qatar",
  "5200": "United Arab Emirates",
  "5210": "Yemen",
  "5230": "Oman",
  "5250": "Bahrain",

  // South Asia
  "5310": "Afghanistan",
  "5330": "India",
  "5350": "Pakistan",
  "5360": "Nepal",
  "5380": "Bangladesh",
  "5420": "Sri Lanka",
  "5682": "Bhutan",
  "5683": "Maldives",

  // Southeast Asia
  "5460": "Burma (Myanmar)",
  "5490": "Thailand",
  "5520": "Vietnam",
  "5530": "Laos",
  "5550": "Cambodia",
  "5570": "Malaysia",
  "5590": "Singapore",
  "5600": "Indonesia",
  "5601": "Timor-Leste",
  "5610": "Brunei",
  "5650": "Philippines",

  // East Asia
  "5660": "Macao",
  "5700": "China",
  "5740": "Mongolia",
  "5790": "North Korea",
  "5800": "South Korea",
  "5820": "Hong Kong",
  "5830": "Taiwan",
  "5880": "Japan",

  // Oceania
  "6021": "Australia",
  "6022": "Norfolk Island",
  "6023": "Cocos (Keeling) Islands",
  "6024": "Christmas Island",
  "6029": "Heard and McDonald Islands",
  "6040": "Papua New Guinea",
  "6141": "New Zealand",
  "6142": "Cook Islands",
  "6143": "Tokelau",
  "6144": "Niue",
  "6150": "Samoa",
  "6223": "Solomon Islands",
  "6224": "Vanuatu",
  "6225": "Pitcairn Islands",
  "6226": "Kiribati",
  "6227": "Tuvalu",
  "6412": "New Caledonia",
  "6413": "Wallis and Futuna",
  "6414": "French Polynesia",
  "6810": "Marshall Islands",
  "6820": "Micronesia",
  "6830": "Palau",
  "6862": "Nauru",
  "6863": "Fiji",
  "6864": "Tonga",

  // Africa
  "7140": "Morocco",
  "7210": "Algeria",
  "7230": "Tunisia",
  "7250": "Libya",
  "7290": "Egypt",
  "7321": "Sudan",
  "7323": "South Sudan",
  "7380": "Equatorial Guinea",
  "7410": "Mauritania",
  "7420": "Cameroon",
  "7440": "Senegal",
  "7450": "Mali",
  "7460": "Guinea",
  "7470": "Sierra Leone",
  "7480": "Côte d'Ivoire",
  "7490": "Ghana",
  "7500": "Gambia",
  "7510": "Niger",
  "7520": "Togo",
  "7530": "Nigeria",
  "7540": "Central African Republic",
  "7550": "Gabon",
  "7560": "Chad",
  "7580": "Saint Helena",
  "7600": "Burkina Faso",
  "7610": "Benin",
  "7620": "Angola",
  "7630": "Republic of the Congo",
  "7642": "Guinea-Bissau",
  "7643": "Cabo Verde",
  "7644": "São Tomé and Príncipe",
  "7650": "Liberia",
  "7660": "Democratic Republic of the Congo",
  "7670": "Burundi",
  "7690": "Rwanda",
  "7700": "Somalia",
  "7741": "Eritrea",
  "7749": "Ethiopia",
  "7770": "Djibouti",
  "7780": "Uganda",
  "7790": "Kenya",
  "7800": "Seychelles",
  "7810": "British Indian Ocean Territory",
  "7830": "Tanzania",
  "7850": "Mauritius",
  "7870": "Mozambique",
  "7880": "Madagascar",
  "7881": "Mayotte",
  "7890": "Comoros",
  "7904": "Réunion",
  "7905": "French Southern Territories",
  "7910": "South Africa",
  "7920": "Namibia",
  "7930": "Botswana",
  "7940": "Zambia",
  "7950": "Eswatini",
  "7960": "Zimbabwe",
  "7970": "Malawi",
  "7990": "Lesotho",

  // US territories
  "9030": "Puerto Rico",
  "9110": "US Virgin Islands",
  "9350": "Guam",
  "9510": "American Samoa",
  "9610": "Northern Mariana Islands",
  "9800": "US Minor Outlying Islands",
};

export function getCountryName(code: string): string {
  return CENSUS_COUNTRIES[code] ?? `Country ${code}`;
}

// ===========================================================================
// URL slugs — used by the /country/[slug] profile pages (Phase 3.65).
//
// We don't expose raw Census codes in URLs ("/country/5700" is opaque and
// unguessable); instead each country gets a human-readable slug derived from
// its name ("china", "united-kingdom", "cote-d-ivoire"). Slugs are built once
// at module load from CENSUS_COUNTRIES so they can never drift out of sync
// with the name map. If two names ever slugify to the same string, the second
// one is disambiguated by appending its Census code.
// ===========================================================================

/** Lowercase, strip diacritics, collapse non-alphanumerics to single hyphens. */
function slugify(name: string): string {
  // Decompose accented letters (é -> e + combining mark), then drop the
  // combining marks by code point (U+0300–U+036F) so "Curaçao" -> "curacao"
  // rather than "cura-ao". Code-point filtering avoids embedding literal
  // combining characters in this source file.
  const decomposed = name.normalize("NFD");
  let stripped = "";
  for (const ch of decomposed) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x300 && cp <= 0x36f) continue;
    stripped += ch;
  }
  return stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const CODE_TO_SLUG: Record<string, string> = {};
const SLUG_TO_CODE: Record<string, string> = {};
for (const [code, name] of Object.entries(CENSUS_COUNTRIES)) {
  let slug = slugify(name);
  if (SLUG_TO_CODE[slug] && SLUG_TO_CODE[slug] !== code) {
    slug = `${slug}-${code}`; // collision guard
  }
  CODE_TO_SLUG[code] = slug;
  SLUG_TO_CODE[slug] = code;
}

/** Census code -> URL slug. Falls back to "country-<code>" for unmapped codes. */
export function getCountrySlug(code: string): string {
  return CODE_TO_SLUG[code] ?? `country-${code}`;
}

/** URL slug -> Census code, or null if the slug isn't recognized. */
export function getCodeFromSlug(slug: string): string | null {
  return SLUG_TO_CODE[slug] ?? null;
}

// Column 2 (non-NTR) countries — statutory high duty rates apply rather than
// the normal MFN/NTR Column 1 rates. Census Schedule C codes. These almost
// never appear in country_total_duties (little/no dutiable U.S. trade), so the
// /country profile pages force them into the generated set anyway — they're
// high-interest names and we want to show their tariff-column status rather
// than 404. Shared by the country page + sitemap.
export const COLUMN_2_CODES = new Set([
  "2390", // Cuba
  "5790", // North Korea
  "4621", // Russia
  "4622", // Belarus
]);
