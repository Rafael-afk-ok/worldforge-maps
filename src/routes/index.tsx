import { createFileRoute } from "@tanstack/react-router";
import MapApp from "@/components/MapApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Atlas das Nações — Mapa de reinos" },
      { name: "description", content: "Mapa editável de nações, alianças, tratados, cidades, fortes e rotas." },
      { property: "og:title", content: "Atlas das Nações" },
      { property: "og:description", content: "Mapa editável de nações, alianças, tratados, cidades, fortes e rotas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MapApp,
});
