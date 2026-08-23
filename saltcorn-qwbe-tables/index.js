const Workflow = require("@saltcorn/data/models/workflow");
const Form = require("@saltcorn/data/models/form");
const { json_list_to_external_table } = require("@saltcorn/data/plugin-helper");

// qwbe REST table provider: each configured instance exposes one qwbe list
// endpoint (from the OpenAPI document) as a Saltcorn external table.
// qwbe keeps all authorization server-side; the token here is a DEV token.

const DEFAULT_BASE = "http://host.docker.internal:4500";

const configuration_workflow = () =>
  new Workflow({
    steps: [
      {
        name: "connection",
        form: async () =>
          new Form({
            fields: [
              {
                name: "base_url",
                label: "qwbe API base URL",
                sublabel: "From docker, the host is usually http://host.docker.internal:4500",
                required: true,
                type: "String",
                default: DEFAULT_BASE,
              },
              {
                name: "token",
                label: "qwbe bearer token (DEV ONLY)",
                sublabel: "Obtained from POST /auth/login. Development use only.",
                required: true,
                type: "String",
              },
              {
                name: "path",
                label: "List endpoint path",
                sublabel: "e.g. /notes — must answer {rows: [...], total: n}",
                required: true,
                type: "String",
              },
              {
                name: "fields",
                label: "Fields (name:Type, comma separated)",
                sublabel: "e.g. id:String, title:String, content:String, createdAt:String",
                required: true,
                type: "String",
              },
            ],
          }),
      },
    ],
  });

const parseFields = (spec) =>
  String(spec || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, type = "String"] = part.split(":").map((s) => s.trim());
      return { name, label: name, type };
    });

module.exports = {
  sc_plugin_api_version: 1,
  plugin_name: "saltcorn-qwbe-tables",
  table_providers: {
    "qwbe cube (REST)": {
      configuration_workflow,
      fields: (cfg) => parseFields(cfg?.fields),
      get_table: (cfg) =>
        json_list_to_external_table(
          async (where, selopts = {}) => {
            if (!cfg?.token || !cfg?.path) return [];
            const base = (cfg.base_url || DEFAULT_BASE).replace(/\/$/, "");
            const params = new URLSearchParams();
            const limit = Math.min(Number(selopts.limit) || 200, 200);
            params.set("limit", String(limit));
            if (selopts.offset) params.set("offset", String(Number(selopts.offset) || 0));
            const res = await fetch(`${base}${cfg.path}?${params}`, {
              headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/json" },
            });
            if (!res.ok) throw new Error(`qwbe ${cfg.path} answered ${res.status}`);
            const body = await res.json();
            return body.rows ?? [];
          },
          parseFields(cfg?.fields),
        ),
    },
  },
};
