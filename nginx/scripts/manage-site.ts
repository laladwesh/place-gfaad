import "dotenv/config";

import { configureProjectRouting } from "../src/manager.js";

async function main(): Promise<void> {
  const [siteName, subdomain, portRaw] = process.argv.slice(2);
  const rootDomain = process.env.DOMAIN_NAME;

  if (!siteName || !subdomain || !portRaw || !rootDomain) {
    console.error(
      [
        "Usage: npm run manage-site --workspace nginx -- <siteName> <subdomain> <port>",
        "Example: npm run manage-site --workspace nginx -- project-a project-a 15001",
        "DOMAIN_NAME must be present in environment."
      ].join("\n")
    );
    process.exit(1);
  }

  const port = Number.parseInt(portRaw, 10);
  await configureProjectRouting({
    siteName,
    subdomain,
    port,
    rootDomain
  });

  console.log(`NGINX route configured for https://${subdomain}.${rootDomain}`);
}

main().catch((error) => {
  console.error("Failed to configure NGINX site", error);
  process.exit(1);
});
