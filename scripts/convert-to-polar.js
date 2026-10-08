const fs = require('fs');
const path = require('path');

const STATE_MAP = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

function expandState(state) {
  if (!state) return '';
  const s = String(state).trim().toUpperCase();
  return STATE_MAP[s] || state;
}

function buildAddress(raw) {
  const firstName = (raw.firstName || '').trim();
  const lastName = (raw.lastName || '').trim();
  return {
    name: `${firstName} ${lastName}`.trim(),
    email: raw.email || '',
    phone: raw.phone || '',
    line1: raw.address || '',
    line2: raw.address2 || '',
    line3: raw.address3 || '',
    postCode: raw.zipCode || '',
    city: raw.city || '',
    country: raw.country || 'United States',
    state: expandState(raw.state),
  };
}

function convertProfile(p) {
  const shipping = buildAddress(p.shipping || {});
  const billing = p.sameAsBilling ? shipping : buildAddress(p.billing || p.shipping || {});
  const card = p.cardInfo || {};

  return {
    name: p.name || '',
    notes: p.notes || '',
    billingAddress: billing,
    shippingAddress: shipping,
    paymentDetails: {
      nameOnCard: card.holder || shipping.name || '',
      cardType: card.cardType || '',
      cardNumber: String(card.cardNumber || '').replace(/\s+/g, ''),
      cardExpMonth: String(card.expMonth || '').padStart(2, '0'),
      cardExpYear: String(card.expYear || ''),
      cardCvv: String(card.cvv || ''),
    },
    sameBillingAndShippingAddress: !!p.sameAsBilling,
    onlyCheckoutOnce: false,
    matchNameOnCardAndAddress: false,
  };
}

function loadJson(filePath) {
  const full = path.resolve(filePath);
  if (!fs.existsSync(full)) {
    console.warn(`Skipping missing file: ${full}`);
    return [];
  }
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

function main() {
  // Usage: node convert-to-polar.js [input.json ...] [--out output.json]
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const outArg = outIndex >= 0 ? args.splice(outIndex, 2)[1] : null;
  const downloadDir = process.env.HOME || '/home/girish-sekar';
  const files = args.length ? args : [
    path.join(downloadDir, 'Downloads/justryen.json'),
    path.join(downloadDir, 'Downloads/justryenVCC.json'),
    path.join(downloadDir, 'Downloads/girish.json'),
    path.join(downloadDir, 'Downloads/aco.json'),
  ];

  const profiles = files.flatMap((f) => {
    const data = loadJson(f);
    return Array.isArray(data) ? data.map(convertProfile) : [];
  });

  const polarExport = {
    polarExport: {
      version: 1,
      kind: 'profiles',
      format: 'aycd',
      profileGroup: 'Converted Profiles',
      exportedAt: new Date().toISOString(),
      profiles,
    },
  };

  const outPath = path.resolve(outArg || path.join(process.cwd(), 'PolarAIO.json'));
  fs.writeFileSync(outPath, JSON.stringify(polarExport, null, 2));
  console.log(`Wrote ${profiles.length} profiles to ${outPath}`);
  const missingCards = profiles.filter((p) => !p.paymentDetails.cardNumber).map((p) => p.name);
  if (missingCards.length) console.warn(`No card details for: ${missingCards.join(', ')}`);
}

main();
