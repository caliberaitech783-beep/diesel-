# Diesel repository guidance

- Put each feature under `src/features/<feature>/` and name it using product terminology. Give each file a clear responsibility and a name that makes it easy to find. Keep each feature’s UI, business rules, and data access in separate modules and put its tests alongside the feature. Create folders as the product needs them.
- Keep frontend and server entry points focused on startup and wiring. Give each new feature its own module. Put calculations and business rules in feature modules so page components and HTTP handlers can delegate to them.
- Keep code in its feature until another feature needs it. Name shared modules for what they do.
- Use one package manager and commit its lockfile. Keep secrets, local databases, uploads, and generated builds out of Git. Add an `.env.example` with placeholder values when configuration is needed.
- Keep the README short. Document the actual entry points, where to add a feature, and the commands to run, test, and build. When deployment is set up, use the documented production build from a clean checkout and record the deploy steps and required configuration. Update the README with any change to those instructions and verify the affected commands.
- Keep changes focused. Run relevant checks for the affected workflows and business rules before finishing.

## Deploying Diesel

- For a requested production release, use the shared GitHub Actions workflow `Test and deploy Diesel` on `main` in `caliberaitech783-beep/diesel-`. See the README deployment section for configuration and the Azure Deployment Center fallback.
- Check the workflow run and verify the expected release at `https://pulse-lll.cmll.in/healthz`. GitHub Actions uses the app-scoped Azure identity when configured, so a Codex chat does not need its own Azure portal login to deploy.
