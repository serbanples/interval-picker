# interval-picker

The `impl1` branch contains automatic-setup integration code. See
[XSERVICE_CONFIGURATION.md](XSERVICE_CONFIGURATION.md) for xService types,
defaults, schemas, parser integration and the consolidated service creator.

BMW linkage is applied after HTML/CSV processing only to branches with resolved
`DMS === "formel1"`. See the BMW section of the integration guide for required
ATBAS, dropdown and header inputs.

Run the isolated regression suite with `npm test` (Node 24+).
