"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Select, SelectItem, type SelectProps } from "@/components/ui/select";
import { getCountryOptions } from "@/lib/countries";
import { PROJECT_TYPE_KEYS } from "@/lib/validation/project";

export type ProjectMetadataDefaults = {
  city?: string | null;
  cityGeoNamesId?: number | null;
  countryCode?: string | null;
  projectType?: string | null;
  projectTypeCustom?: string | null;
};

export function useProjectMetadataControls(defaults: ProjectMetadataDefaults = {}, onDirty?: () => void) {
  const t = useTranslations("ProjectForm");
  const [projectType, setProjectType] = useState(defaults.projectType ?? "");
  const [projectTypeCustom, setProjectTypeCustom] = useState(defaults.projectTypeCustom ?? "");
  const [countryCode, setCountryCode] = useState(defaults.countryCode ?? "UA");
  const [city, setCity] = useState(defaults.city ?? "");
  const [cityGeoNamesId, setCityGeoNamesId] = useState<number | undefined>(defaults.cityGeoNamesId ?? undefined);
  const [countryResetMessage, setCountryResetMessage] = useState("");

  function changeProjectType(value: string) {
    setProjectType(value);
    if (value !== "other") setProjectTypeCustom("");
    onDirty?.();
  }

  function changeProjectTypeCustom(value: string) {
    setProjectTypeCustom(value);
    onDirty?.();
  }

  function changeCountry(nextCountryCode: string) {
    if (nextCountryCode === countryCode) return;
    setCountryCode(nextCountryCode);
    setCityGeoNamesId(undefined);
    if (city) {
      setCity("");
      setCountryResetMessage(t("cityCleared"));
    }
    onDirty?.();
  }

  function changeCity(value: string) {
    setCity(value);
    onDirty?.();
  }

  return {
    changeCity,
    changeCountry,
    changeProjectType,
    changeProjectTypeCustom,
    city,
    cityGeoNamesId,
    countryCode,
    countryResetMessage,
    projectType,
    projectTypeCustom,
    setCityGeoNamesId,
  };
}

export function ProjectTypeSelect(props: Omit<SelectProps, "children">) {
  const t = useTranslations("ProjectForm");
  const projectTypes = useTranslations("ProjectTypes");
  return <Select {...props}>
    <SelectItem value="">{t("notSpecified")}</SelectItem>
    {PROJECT_TYPE_KEYS.map((key) => <SelectItem key={key} value={key}>{projectTypes(key)}</SelectItem>)}
  </Select>;
}

export function ProjectCountrySelect({ legacyCountry, ...props }: Omit<SelectProps, "children"> & { legacyCountry?: string | null }) {
  const locale = useLocale();
  const countryOptions = useMemo(() => getCountryOptions(locale), [locale]);
  return <Select {...props}>
    {legacyCountry ? <SelectItem value="__legacy__" textValue={legacyCountry}>{legacyCountry}</SelectItem> : null}
    {countryOptions.map((country) => <SelectItem key={country.code} value={country.code} textValue={country.label}>{country.label}</SelectItem>)}
  </Select>;
}
