// sync_plan_brevo.js
// Sincroniza el campo PLAN de Supabase -> Brevo para la lista #2
// Uso: BREVO_API_KEY=xxxx node sync_plan_brevo.js

const contactos = [
  // cultivador
  { email: "gustavo.rodriguez906@gmail.com", plan: "cultivador" },
  { email: "bohlezequiel@gmail.com", plan: "cultivador" },
  // fundador
  { email: "sergio_casas_martinez@hotmail.es", plan: "fundador" },
  { email: "tinofl0100@gmail.com", plan: "fundador" },
  { email: "raynergonzalez73@gmail.com", plan: "fundador" },
  { email: "danielperezdana@gmail.com", plan: "fundador" },
  { email: "only_adri88@hotmail.com", plan: "fundador" },
  { email: "csolorzano826@gmail.com", plan: "fundador" },
  { email: "lologg03@gmail.com", plan: "fundador" },
  { email: "g.ceo@growverse.net", plan: "fundador" },
  { email: "3rrot007@gmail.com", plan: "fundador" },
  { email: "maurowayra@proton.me", plan: "fundador" },
  { email: "arabehd78514@gmail.com", plan: "fundador" },
  // libre
  { email: "jorgehg2160@gmail.com", plan: "libre" },
  { email: "sergioggm12@gmail.com", plan: "libre" },
  { email: "talayotikterps@protonmail.com", plan: "libre" },
  { email: "raptvoficial@gmail.com", plan: "libre" },
  { email: "buitoooo@hotmail.com", plan: "libre" },
  { email: "levantweed@gmail.com", plan: "libre" },
  { email: "ikermaboy63@gmail.com", plan: "libre" },
  { email: "daniellopezmiguel@hotmail.com", plan: "libre" },
  { email: "emanuelramongomez4.20@gmail.com", plan: "libre" },
  { email: "alejandrodiego217@gmail.com", plan: "libre" },
  { email: "keitrichar@hotmail.com", plan: "libre" },
  { email: "jcontreras000@gmail.com", plan: "libre" },
  { email: "danso370@gmail.com", plan: "libre" },
  { email: "juanjosebarro1122@gmail.com", plan: "libre" },
  { email: "casti.darksouls@gmail.com", plan: "libre" },
  { email: "enriquedorta@gmail.com", plan: "libre" },
  { email: "fenorock@gmail.com", plan: "libre" },
  { email: "papeegod@gmail.com", plan: "libre" },
];

const API_KEY = process.env.BREVO_API_KEY;
if (!API_KEY) {
  console.error("Falta BREVO_API_KEY en el entorno. Ejemplo:\n  BREVO_API_KEY=xxxx node sync_plan_brevo.js");
  process.exit(1);
}

async function syncContact(email, plan) {
  const res = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
    method: "PUT",
    headers: {
      "api-key": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      attributes: { PLAN: plan },
      updateEnabled: true, // si no existe, lo crea
    }),
  });

  if (res.status === 204) {
    console.log(`OK   ${email} -> ${plan}`);
    return true;
  } else {
    const body = await res.text();
    console.error(`FAIL ${email} -> ${plan} | ${res.status} | ${body}`);
    return false;
  }
}

(async () => {
  console.log(`Sincronizando ${contactos.length} contactos...\n`);
  let ok = 0, fail = 0;
  for (const c of contactos) {
    const success = await syncContact(c.email, c.plan);
    success ? ok++ : fail++;
    await new Promise((r) => setTimeout(r, 300)); // evita rate limit
  }
  console.log(`\nHecho. OK: ${ok} | FAIL: ${fail}`);
})();
