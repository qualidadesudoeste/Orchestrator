import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileCog, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export type VpnFormState = {
  vpnProvider: "NONE" | "COGEL" | "SEFAZ" | "OUTRA";
  vpnProfileName: string;
  vpnUsername: string;
  vpnPassword: string;
  vpnAutoConnect: boolean;
  vpnConnectionStrategy: "AUTO" | "CLI" | "AUTOCONNECT";
  vpnConfigFileName: string;
  vpnConfigBase64: string;
  vpnConfigPassword: string;
  vpnInstallerUrl: string;
  vpnInstallerSha256: string;
  vpnVerificationUrl: string;
};

export function VpnConfigurationFields({
  value,
  onChange,
  hasStoredConfig,
}: {
  value: VpnFormState;
  onChange: (next: VpnFormState) => void;
  hasStoredConfig: boolean;
}) {
  const update = <K extends keyof VpnFormState>(key: K, next: VpnFormState[K]) => onChange({ ...value, [key]: next });

  const readConfig = (file?: File) => {
    if (!file) return;
    if (!/\.(?:conf|xml)$/i.test(file.name)) {
      toast.error("Selecione um arquivo .conf ou .xml do FortiClient.");
      return;
    }
    if (file.size > 1024 * 1024) {
      toast.error("O arquivo de configuração deve possuir no máximo 1 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const encoded = String(reader.result ?? "").split(",", 2)[1] ?? "";
      onChange({ ...value, vpnConfigFileName: file.name, vpnConfigBase64: encoded });
    };
    reader.onerror = () => toast.error("Não foi possível ler o arquivo de configuração.");
    reader.readAsDataURL(file);
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 sm:col-span-2">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-800">
        <ShieldCheck className="h-4 w-4" /> Gerenciador local de VPN
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">VPN utilizada</Label>
          <Select value={value.vpnProvider} onValueChange={provider => onChange({
            ...value,
            vpnProvider: provider as VpnFormState["vpnProvider"],
            vpnProfileName: provider === "COGEL" ? "Prodeb" : provider === "SEFAZ" ? "Sefaz" : provider === "NONE" ? "" : value.vpnProfileName,
          })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">Não utiliza VPN</SelectItem>
              <SelectItem value="COGEL">Cogel</SelectItem>
              <SelectItem value="SEFAZ">Sefaz</SelectItem>
              <SelectItem value="OUTRA">Outra VPN</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {value.vpnProvider !== "NONE" && <>
          <div>
            <Label className="text-xs">Perfil no FortiClient</Label>
            <Input className="mt-1" placeholder="Ex.: Sefaz" value={value.vpnProfileName} onChange={event => update("vpnProfileName", event.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Usuário da VPN</Label>
            <Input className="mt-1" value={value.vpnUsername} onChange={event => update("vpnUsername", event.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Senha da VPN</Label>
            <Input className="mt-1" type="password" autoComplete="new-password" placeholder="Vazio mantém a senha atual" value={value.vpnPassword} onChange={event => update("vpnPassword", event.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Estratégia de conexão</Label>
            <Select value={value.vpnConnectionStrategy} onValueChange={strategy => update("vpnConnectionStrategy", strategy as VpnFormState["vpnConnectionStrategy"])}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="AUTO">Automática (recomendado)</SelectItem>
                <SelectItem value="AUTOCONNECT">Perfil Auto Connect</SelectItem>
                <SelectItem value="CLI">Somente CLI</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Arquivo .conf ou .xml</Label>
            <label className="mt-1 flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-white px-3 text-xs text-slate-600 hover:bg-slate-50">
              <FileCog className="h-4 w-4" />
              <span className="truncate">{value.vpnConfigFileName || (hasStoredConfig ? "Configuração já armazenada" : "Selecionar configuração")}</span>
              <input className="hidden" type="file" accept=".conf,.xml" onChange={event => readConfig(event.target.files?.[0])} />
            </label>
          </div>
          <div>
            <Label className="text-xs">Senha do arquivo de configuração</Label>
            <Input className="mt-1" type="password" autoComplete="new-password" placeholder="Somente se o arquivo for protegido" value={value.vpnConfigPassword} onChange={event => update("vpnConfigPassword", event.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">URL interna para confirmar a VPN</Label>
            <Input className="mt-1" type="url" placeholder="https://sistema.interno/health ou URL do ambiente" value={value.vpnVerificationUrl} onChange={event => update("vpnVerificationUrl", event.target.value)} />
          </div>
          <div className="sm:col-span-2 rounded-md border border-amber-100 bg-white/70 p-3">
            <p className="text-xs font-semibold text-slate-700">Instalação automática, se necessária</p>
            <p className="mt-1 text-[11px] text-slate-500">Use somente o endereço oficial fornecido pela organização. O Orchestrator valida HTTPS, SHA-256 e assinatura digital da Fortinet antes de abrir o UAC.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_280px]">
              <Input type="url" placeholder="URL HTTPS do instalador .msi ou .exe" value={value.vpnInstallerUrl} onChange={event => update("vpnInstallerUrl", event.target.value)} />
              <Input className="font-mono text-xs" placeholder="SHA-256 (64 caracteres)" value={value.vpnInstallerSha256} onChange={event => update("vpnInstallerSha256", event.target.value.replace(/\s/g, "").toLowerCase())} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700 sm:col-span-2">
            <input type="checkbox" checked={value.vpnAutoConnect} onChange={event => update("vpnAutoConnect", event.target.checked)} />
            Preparar e conectar automaticamente antes da automação
          </label>
          <p className="text-[11px] text-slate-500 sm:col-span-2">O arquivo e as senhas ficam criptografados, não são enviados à IA/n8n e nunca são exibidos novamente. MFA ou aceite no FortiClient ainda podem exigir sua confirmação.</p>
        </>}
      </div>
    </div>
  );
}
