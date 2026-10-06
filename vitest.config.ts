import { defineConfig } from "vitest/config";

export default defineConfig({
  define: { __VERSION__: JSON.stringify("0.0.0-test") },
  test: {
    environment: "happy-dom",
    environmentOptions: {
      happyDOM: {
        url: "https://app.example.com/",
        settings: {
          navigation: { disableChildFrameNavigation: true },
          disableJavaScriptFileLoading: true,
          handleDisabledFileLoadingAsSuccess: true,
        },
      },
    },
    include: ["test/**/*.test.ts"],
    restoreMocks: true,
  },
});
