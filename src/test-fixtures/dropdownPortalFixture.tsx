import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { DisclosureSection } from "../components/ui/DisclosureSection";
import { Dropdown } from "../components/ui/Dropdown";
import { SettingContainer } from "../components/ui/SettingContainer";
import "../theme.css";

const i18n = i18next.createInstance();

void i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
  resources: {
    en: {
      translation: {
        common: {
          noOptionsFound: "No options found",
        },
      },
    },
  },
});

const FixtureApp = () => {
  const [selectedValue, setSelectedValue] = useState("native_keys");

  return (
    <div className="flex h-screen overflow-hidden bg-[color-mix(in_srgb,var(--ss-bg-app)_94%,white)] px-6 py-6 text-ss-text-primary">
      <div className="mx-auto flex h-full w-full max-w-[1080px] flex-col overflow-hidden rounded-[28px] border border-ss-border-subtle bg-[color-mix(in_srgb,var(--ss-bg-surface)_92%,transparent)] p-6 shadow-[var(--ss-shadow-lift)]">
        <div className="flex-1 overflow-hidden rounded-[24px] border border-ss-border-subtle bg-ss-bg-surface-alt/40 p-4">
          <div className="flex h-full flex-col justify-end">
            <DisclosureSection
              title="Experimental"
              description="Features that are still evolving and may change."
              defaultOpen
              tone="caution"
            >
              <SettingContainer
                title="Experimental Features"
                description="Turn on features that are still being tested."
                descriptionMode="inline"
                grouped
              >
                <div className="text-sm text-ss-text-secondary">Enabled</div>
              </SettingContainer>
              <SettingContainer
                title="Post Processing"
                description="Enable AI-powered text refinement after transcription."
                descriptionMode="inline"
                grouped
              >
                <div className="text-sm text-ss-text-secondary">Enabled</div>
              </SettingContainer>
              <SettingContainer
                title="Keyboard Implementation"
                description="Choose the keyboard shortcut backend."
                descriptionMode="inline"
                grouped
              >
                <Dropdown
                  options={[
                    {
                      value: "tauri",
                      label: "Tauri Global Shortcut",
                    },
                    {
                      value: "native_keys",
                      label: "Native Keys",
                    },
                  ]}
                  selectedValue={selectedValue}
                  onSelect={setSelectedValue}
                />
              </SettingContainer>
            </DisclosureSection>
          </div>
        </div>
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <FixtureApp />
    </I18nextProvider>
  </React.StrictMode>,
);
