import { useEffect, useState } from "react";
import { onlyDigits } from "@/lib/cnpj";

export interface BrasilApiCnpjData {
  cnpj: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  ddd_telefone_1: string | null;
  email: string | null;
  descricao_situacao_cadastral: string | null;
  [k: string]: any;
}

export type CnpjFetchStatus = "idle" | "loading" | "success" | "not_found" | "network_error";

interface Result {
  data: BrasilApiCnpjData | null;
  loading: boolean;
  error: string | null;
  situacao: string | null;
  status: CnpjFetchStatus;
}

/**
 * Faz fetch automático na BrasilAPI quando o CNPJ tiver 14 dígitos.
 * Debounce 500ms. Cancela requests obsoletas via AbortController.
 */
export function useBrasilApiCnpj(cnpj: string): Result {
  const [data, setData] = useState<BrasilApiCnpjData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<CnpjFetchStatus>("idle");

  const digits = onlyDigits(cnpj);

  useEffect(() => {
    if (digits.length !== 14) {
      setData(null);
      setError(null);
      setLoading(false);
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setStatus("loading");

    const timer = setTimeout(async () => {
      // 1) Tenta BrasilAPI
      try {
        const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        if (res.status === 404) {
          setData(null);
          setStatus("not_found");
          setLoading(false);
          return;
        }
        if (res.ok) {
          const json = (await res.json()) as BrasilApiCnpjData;
          if (controller.signal.aborted) return;
          setData(json);
          setStatus("success");
          setLoading(false);
          return;
        }
        // segue para fallback em qualquer outro status
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        // segue para fallback
      }

      // 2) Fallback: publica.cnpj.ws
      try {
        const res2 = await fetch(`https://publica.cnpj.ws/cnpj/${digits}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (res2.status === 404) {
          setData(null);
          setStatus("not_found");
          setLoading(false);
          return;
        }
        if (!res2.ok) {
          setData(null);
          setError(`HTTP ${res2.status}`);
          setStatus("network_error");
          setLoading(false);
          return;
        }
        const raw = await res2.json();
        const est = raw?.estabelecimento ?? {};
        const mapped: BrasilApiCnpjData = {
          cnpj: est.cnpj ?? digits,
          razao_social: raw?.razao_social ?? null,
          nome_fantasia: est?.nome_fantasia ?? null,
          logradouro: [est?.tipo_logradouro, est?.logradouro].filter(Boolean).join(" ") || null,
          numero: est?.numero ?? null,
          complemento: est?.complemento ?? null,
          bairro: est?.bairro ?? null,
          municipio: est?.cidade?.nome ?? null,
          uf: est?.estado?.sigla ?? null,
          cep: est?.cep ?? null,
          ddd_telefone_1:
            est?.ddd1 && est?.telefone1 ? `${est.ddd1}${est.telefone1}` : null,
          email: est?.email ?? null,
          descricao_situacao_cadastral: est?.situacao_cadastral ?? null,
        };
        setData(mapped);
        setStatus("success");
        setLoading(false);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setData(null);
        setError(err?.message ?? "Erro de rede");
        setStatus("network_error");
        setLoading(false);
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [digits]);

  return {
    data,
    loading,
    error,
    situacao: data?.descricao_situacao_cadastral ?? null,
    status,
  };
}
