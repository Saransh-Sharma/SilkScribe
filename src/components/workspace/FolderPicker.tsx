import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderClosed } from "lucide-react";
import { Dropdown } from "../ui/Dropdown";
import { toastError } from "@/lib/utils/toastError";
import { api } from "./api";

const NONE = "";
const NEW = "\u0000new";

/** Files a document in a Library folder, or a new one by name. */
export function FolderPicker({
  documentId,
  folder,
  onChange,
}: {
  documentId: string;
  folder: string | null;
  onChange: (folder: string | null) => void;
}) {
  const { t } = useTranslation();
  const [folders, setFolders] = useState<string[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    api
      .folders()
      .then(setFolders)
      .catch(() => setFolders([]));
  }, [folder]);

  const file = async (next: string | null) => {
    try {
      await api.setFolder(documentId, next);
      onChange(next);
    } catch (error) {
      toastError(t("workspace.folders.failed"), error);
    }
  };

  const options = [
    { value: NONE, label: t("workspace.folders.none") },
    ...[...new Set([...folders, ...(folder ? [folder] : [])])].map((value) => ({
      value,
      label: value,
    })),
    { value: NEW, label: t("workspace.folders.new") },
  ];

  return (
    <div className="ws-folder-picker">
      <FolderClosed size={14} aria-hidden="true" />
      {naming ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            setNaming(false);
            void file(name.trim());
            setName("");
          }}
        >
          <input
            autoFocus
            dir="auto"
            maxLength={80}
            aria-label={t("workspace.folders.name")}
            placeholder={t("workspace.folders.name")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setNaming(false);
            }}
          />
          <button type="submit" className="ws-text-button">
            {t("workspace.folders.file")}
          </button>
        </form>
      ) : (
        <Dropdown
          ariaLabel={t("workspace.folders.label")}
          selectedValue={folder ?? NONE}
          options={options}
          onSelect={(value) => {
            if (value === NEW) setNaming(true);
            else void file(value === NONE ? null : value);
          }}
        />
      )}
    </div>
  );
}
