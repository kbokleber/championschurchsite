"""
Cliente de integração direta com Evolution Go para envio de mensagens WhatsApp.
"""

from __future__ import annotations

import logging
import json
import re
from typing import Any, Dict, Optional
from urllib.parse import quote

import requests

logger = logging.getLogger(__name__)


def _build_headers(api_key: str) -> Dict[str, str]:
    return {
        "Content-Type": "application/json",
        "User-Agent": "ChampionsChurch-WhatsApp/1.0",
        "apikey": api_key,
        "x-api-key": api_key,
        "X-API-Key": api_key,
        "token": api_key,
        "Authorization": f"Bearer {api_key}",
    }


def _build_base_urls(api_url: str) -> list[str]:
    base_urls = [api_url]
    # Muitos usuários colam URL do painel/manager; removemos para usar a base da API.
    if api_url.endswith("/manager"):
        base_urls.append(api_url[: -len("/manager")].rstrip("/"))
    if "/swagger" in api_url:
        base_urls.append(api_url.split("/swagger", 1)[0].rstrip("/"))
    # Deduplicar mantendo ordem
    return list(dict.fromkeys([u for u in base_urls if u]))


def _json_response(response: requests.Response) -> Optional[Any]:
    try:
        return response.json()
    except (TypeError, ValueError):
        return None


def _coerce_qr_image(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    if text.startswith("data:image/") or text.startswith("http://") or text.startswith("https://"):
        return text
    if len(text) > 200 and re.fullmatch(r"[A-Za-z0-9+/=\r\n]+", text):
        return f"data:image/png;base64,{text}"
    return None


def _extract_qr_image(value: Any) -> Optional[str]:
    if isinstance(value, dict):
        preferred_keys = (
            "qrCode",
            "qrcode",
            "qr_code",
            "qr",
            "base64",
            "image",
            "code",
        )
        for key in preferred_keys:
            image = _coerce_qr_image(value.get(key))
            if image:
                return image
        for item in value.values():
            image = _extract_qr_image(item)
            if image:
                return image
    elif isinstance(value, list):
        for item in value:
            image = _extract_qr_image(item)
            if image:
                return image
    elif isinstance(value, str):
        image = _coerce_qr_image(value)
        if image:
            return image
        try:
            return _extract_qr_image(json.loads(value))
        except (TypeError, ValueError):
            return None
    return None


def _connection_flags(status_json: Any) -> tuple[Optional[bool], Optional[bool]]:
    data = status_json.get("data") if isinstance(status_json, dict) else status_json
    if not isinstance(data, dict):
        return None, None

    connected = data.get("Connected", data.get("connected"))
    logged_in = data.get("LoggedIn", data.get("loggedIn", data.get("logged_in")))

    connected_bool = connected if isinstance(connected, bool) else None
    logged_in_bool = logged_in if isinstance(logged_in, bool) else None
    return connected_bool, logged_in_bool


def normalizar_telefone_whatsapp(valor: Optional[str]) -> Optional[str]:
    """
    Normaliza telefone para formato numérico com DDI.

    Regras:
    - remove qualquer caractere não numérico
    - se vier com 10/11 dígitos (Brasil sem DDI), prefixa 55
    - aceita números com DDI quando tiverem 12+ dígitos
    """
    digits = re.sub(r"\D", "", valor or "")
    if not digits:
        return None
    if digits.startswith("00"):
        digits = digits[2:]
    if len(digits) in (10, 11):
        digits = f"55{digits}"
    if len(digits) < 12:
        return None
    return digits


def _response_json_indica_falha(response: requests.Response) -> bool:
    try:
        data = response.json()
    except (TypeError, ValueError):
        return False

    def _dict_indica_falha(obj: Dict[str, Any]) -> bool:
        if obj.get("success") is False or obj.get("ok") is False:
            return True
        if obj.get("exists") is False:
            return True
        status_value = obj.get("status")
        if isinstance(status_value, int) and status_value >= 400:
            return True
        error_value = obj.get("error")
        if isinstance(error_value, str) and error_value.strip():
            return True
        if isinstance(error_value, (dict, list)) and error_value:
            return True
        message = obj.get("message")
        if isinstance(message, str):
            msg = message.lower()
            if "request failed" in msg or "invalid" in msg or "erro" in msg:
                return True
        return False

    if isinstance(data, dict):
        return _dict_indica_falha(data)
    if isinstance(data, list):
        return any(isinstance(item, dict) and _dict_indica_falha(item) for item in data)
    return False


def enviar_texto_evolution_go(
    config,
    telefone: str,
    mensagem: str,
    instancia_override: str | None = None,
    api_key_override: str | None = None,
    timeout: int = 30,
    max_endpoints: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Envia mensagem de texto para Evolution Go.

    instancia_override: usa outra instância (ex.: loja) reaproveitando a URL base.
    api_key_override: usa outro token de instância (ex.: instância dedicada da loja).

    Retorno padrão:
    {
      entregue: bool,
      motivo: str,
      http_status: int|None,
      url_usada: str|None,
      erro: str|None,
      telefone: str|None,
    }
    """
    resultado = {
        "entregue": False,
        "motivo": "requisicao_erro",
        "http_status": None,
        "url_usada": None,
        "erro": None,
        "telefone": None,
    }

    api_url = (getattr(config, "evolution_api_url", "") or "").strip().rstrip("/")
    if api_key_override is not None and (api_key_override or "").strip():
        api_key = (api_key_override or "").strip()
    else:
        api_key = (getattr(config, "evolution_api_key", "") or "").strip()
    if instancia_override is not None:
        instance = (instancia_override or "").strip()
    else:
        instance = (getattr(config, "evolution_api_instance", "") or "").strip()

    if not api_url or not api_key:
        resultado["motivo"] = "configuracao_incompleta"
        return resultado

    telefone_normalizado = normalizar_telefone_whatsapp(telefone)
    if not telefone_normalizado:
        resultado["motivo"] = "telefone_invalido"
        resultado["erro"] = f"Telefone inválido para envio: {telefone!r}"
        return resultado
    resultado["telefone"] = telefone_normalizado

    if not (mensagem or "").strip():
        resultado["motivo"] = "mensagem_vazia"
        return resultado

    payload = {
        "number": telefone_normalizado,
        "text": mensagem,
    }
    if instance:
        # Compatibilidade entre variações de endpoint/roteamento.
        payload["instanceName"] = instance
        payload["instance"] = instance

    headers = _build_headers(api_key)
    base_urls = _build_base_urls(api_url)

    urls_candidatas = []
    for base in base_urls:
        urls_candidatas.extend([
            f"{base}/send/text",
            f"{base}/message/sendText",
            f"{base}/api/send/text",
            f"{base}/api/message/sendText",
        ])
    urls_candidatas = list(dict.fromkeys(urls_candidatas))
    if max_endpoints is not None and max_endpoints > 0:
        urls_candidatas = urls_candidatas[:max_endpoints]

    ultimo_erro = None
    for url in urls_candidatas:
        resultado["url_usada"] = url
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=timeout)
            resultado["http_status"] = response.status_code

            if 200 <= response.status_code < 300 and not _response_json_indica_falha(response):
                resultado["entregue"] = True
                resultado["motivo"] = "ok"
                resultado["erro"] = None
                return resultado

            if 200 <= response.status_code < 300:
                body_preview = (response.text or "")[:500]
                resultado["motivo"] = "corpo_indica_falha"
                resultado["erro"] = body_preview
                ultimo_erro = body_preview
                continue

            body_preview = (response.text or "")[:500]
            resultado["motivo"] = "http_erro"
            resultado["erro"] = body_preview
            ultimo_erro = body_preview
            # 401/403 geralmente indicam credencial inválida:
            # não adianta testar outras rotas com o mesmo token.
            if response.status_code in (401, 403):
                return resultado
        except Exception as exc:
            resultado["motivo"] = "requisicao_erro"
            resultado["erro"] = str(exc)
            ultimo_erro = str(exc)
            logger.warning("Falha ao enviar para Evolution Go em %s: %s", url, exc)

    if ultimo_erro:
        resultado["erro"] = ultimo_erro
    return resultado


def _instance_path_segment(instance: str) -> str:
    return quote((instance or "").strip(), safe="")


def _extrair_lista_instancias(payload: Any) -> list[Dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("data", "instances", "instance", "result"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
            if isinstance(value, dict):
                return [value]
    return []


def _nome_instancia_registro(registro: Dict[str, Any]) -> str:
    for key in ("name", "Name", "instanceName", "instance_name"):
        value = registro.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _id_instancia_registro(registro: Dict[str, Any]) -> str:
    for key in ("id", "ID", "instanceId", "instance_id"):
        value = registro.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def _token_instancia_registro(registro: Dict[str, Any]) -> str:
    for key in ("token", "Token", "apikey", "apiKey"):
        value = registro.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _buscar_instancias_evolution_go(
    base: str,
    global_api_key: str,
) -> tuple[list[Dict[str, Any]], Optional[str], Optional[int]]:
    headers = _build_headers(global_api_key)
    url = f"{base}/instance/all"
    try:
        response = requests.get(url, headers=headers, timeout=20)
    except Exception as exc:
        return [], str(exc), None

    if response.status_code in (401, 403):
        return [], "global_api_key_invalida", response.status_code
    if not (200 <= response.status_code < 300):
        return [], (response.text or "")[:400], response.status_code

    return _extrair_lista_instancias(_json_response(response) or []), None, response.status_code


def _validar_instancia_no_catalogo(
    instancias: list[Dict[str, Any]],
    instance: str,
    token: str,
) -> tuple[bool, str, Optional[str]]:
    alvo = (instance or "").strip().lower()
    token_informado = (token or "").strip()
    if not alvo:
        return False, "instancia_nao_informada", "Informe o nome da instância."

    registro = None
    for item in instancias:
        nome = _nome_instancia_registro(item).lower()
        identificador = _id_instancia_registro(item).lower()
        if alvo in (nome, identificador):
            registro = item
            break

    if registro is None:
        return False, "instancia_nao_encontrada", (
            f'Instância "{instance}" não existe no Evolution Go. '
            "Verifique o nome exato no painel (aba Instâncias)."
        )

    token_registro = _token_instancia_registro(registro)
    if token_registro and token_registro != token_informado:
        return False, "token_instancia_incompativel", (
            f'O token informado não corresponde à instância "{instance}". '
            "Copie o token dessa instância no painel Evolution."
        )

    return True, "ok", None


def _resposta_e_404_rota_inexistente(response: requests.Response) -> bool:
    """Evolution Go responde 404 literal quando a rota com /{nome}/ não existe."""
    if response.status_code != 404:
        return False
    body = (response.text or "").strip().lower()
    return body in ("404 page not found", "not found") or body.startswith("404 page not found")


def _aplicar_resultado_status_instancia(
    resultado: Dict[str, Any],
    response: requests.Response,
    *,
    base: str,
    headers: Dict[str, str],
    instance: str,
    qr_url: Optional[str] = None,
) -> bool:
    """
    Interpreta resposta de status da instância.
    Retorna True se o diagnóstico terminou (sucesso ou erro definitivo).
    """
    body_preview = (response.text or "")[:600]
    resultado["status_http"] = response.status_code
    resultado["status_response"] = body_preview

    if response.status_code in (401, 403):
        resultado["motivo"] = "nao_autorizado"
        resultado["detalhe"] = body_preview
        return True

    if response.status_code == 404:
        resultado["motivo"] = "instancia_nao_encontrada"
        resultado["detalhe"] = (
            f'Instância "{instance}" não encontrada na Evolution Go. '
            "Verifique o nome exato cadastrado no painel."
        )
        return True

    if 200 <= response.status_code < 300:
        status_json = _json_response(response)
        if isinstance(status_json, dict):
            error = status_json.get("error")
            if isinstance(error, dict) and (error.get("code") or "").upper() == "NOT_FOUND":
                resultado["motivo"] = "instancia_nao_encontrada"
                resultado["detalhe"] = (
                    f'Instância "{instance}" não encontrada na Evolution Go. '
                    "Verifique o nome exato cadastrado no painel."
                )
                return True
            if status_json.get("success") is False and "not found" in str(
                (error or {}).get("message") or status_json.get("message") or ""
            ).lower():
                resultado["motivo"] = "instancia_nao_encontrada"
                resultado["detalhe"] = (
                    f'Instância "{instance}" não encontrada na Evolution Go. '
                    "Verifique o nome exato cadastrado no painel."
                )
                return True

        conectado, logado = _connection_flags(status_json)
        resultado["conectado"] = conectado
        resultado["logado"] = logado

        seg = _instance_path_segment(instance)
        qr_endpoint = qr_url or f"{base}/instance/{seg}/qr"
        try:
            qr_response = requests.get(
                qr_endpoint,
                headers=headers,
                timeout=20,
            )
            qr_text = qr_response.text or ""
            resultado["qr_response"] = qr_text[:600]
            resultado["qr_image"] = _extract_qr_image(_json_response(qr_response) or qr_text)
        except Exception as exc:
            logger.warning("Falha ao consultar QR da Evolution Go: %s", exc)

        if conectado is False or logado is False:
            resultado["ok"] = False
            resultado["motivo"] = "whatsapp_desconectado"
            resultado["detalhe"] = (
                f'Instância "{instance}" localizada, mas o WhatsApp não está conectado.'
            )
            return True

        resultado["ok"] = True
        resultado["motivo"] = "ok"
        resultado["detalhe"] = body_preview
        resultado["validacao_instancia"] = "por_nome"
        return True

    resultado["motivo"] = "http_erro"
    resultado["detalhe"] = body_preview
    return False


def _diagnosticar_evolution_go_por_token(
    resultado: Dict[str, Any],
    *,
    base: str,
    headers: Dict[str, str],
    instance: str,
    instance_token: str,
    global_api_key: str,
) -> bool:
    """
    Evolution Go: GET /instance/status valida URL + token da instância.
    O nome da instância é validado via GET /instance/all (chave global).
    """
    url_status = f"{base}/instance/status"
    resultado["url_usada"] = url_status
    resultado["estilo_api"] = "evolution_go"

    try:
        response = requests.get(url_status, headers=headers, timeout=20)
    except Exception as exc:
        resultado["motivo"] = "requisicao_erro"
        resultado["detalhe"] = str(exc)
        return True

    body_preview = (response.text or "")[:600]
    resultado["status_http"] = response.status_code
    resultado["status_response"] = body_preview

    if response.status_code in (401, 403):
        resultado["motivo"] = "nao_autorizado"
        resultado["detalhe"] = "Token da instância recusado pelo servidor Evolution Go."
        return True

    if not (200 <= response.status_code < 300):
        resultado["motivo"] = "http_erro"
        resultado["detalhe"] = body_preview
        return True

    status_json = _json_response(response)
    conectado, logado = _connection_flags(status_json)
    resultado["conectado"] = conectado
    resultado["logado"] = logado

    try:
        qr_response = requests.get(f"{base}/instance/qr", headers=headers, timeout=20)
        qr_text = qr_response.text or ""
        resultado["qr_response"] = qr_text[:600]
        resultado["qr_image"] = _extract_qr_image(_json_response(qr_response) or qr_text)
    except Exception as exc:
        logger.warning("Falha ao consultar QR da Evolution Go: %s", exc)

    if conectado is False or logado is False:
        resultado["ok"] = False
        resultado["motivo"] = "whatsapp_desconectado"
        resultado["detalhe"] = (
            f'Token válido, mas o WhatsApp da instância "{instance}" não está conectado.'
        )
        return True

    if not (global_api_key or "").strip():
        resultado["ok"] = False
        resultado["motivo"] = "global_api_key_necessaria"
        resultado["detalhe"] = (
            "URL e token da instância estão corretos, mas o Evolution Go exige a "
            "GLOBAL_API_KEY (chave global) para validar o nome da instância. "
            "Informe-a em Configurações → WhatsApp → Credenciais."
        )
        return True

    instancias, erro_listagem, http_listagem = _buscar_instancias_evolution_go(
        base,
        global_api_key.strip(),
    )
    resultado["catalogo_http"] = http_listagem
    if erro_listagem == "global_api_key_invalida":
        resultado["ok"] = False
        resultado["motivo"] = "global_api_key_invalida"
        resultado["detalhe"] = (
            "A chave global do Evolution Go foi recusada. "
            "Verifique a GLOBAL_API_KEY no painel do servidor."
        )
        return True
    if erro_listagem:
        resultado["ok"] = False
        resultado["motivo"] = "http_erro"
        resultado["detalhe"] = f"Não foi possível listar instâncias: {erro_listagem}"
        return True

    ok_instancia, motivo_instancia, detalhe_instancia = _validar_instancia_no_catalogo(
        instancias,
        instance,
        instance_token,
    )
    if not ok_instancia:
        resultado["ok"] = False
        resultado["motivo"] = motivo_instancia
        resultado["detalhe"] = detalhe_instancia
        return True

    perfil = ""
    if isinstance(status_json, dict):
        data = status_json.get("data") if isinstance(status_json.get("data"), dict) else {}
        perfil = (data.get("Name") or data.get("name") or "").strip()

    resultado["ok"] = True
    resultado["motivo"] = "ok"
    resultado["validacao_instancia"] = "por_catalogo"
    resultado["detalhe"] = body_preview
    if perfil:
        resultado["aviso"] = f'Perfil WhatsApp conectado: "{perfil}".'
    return True


def diagnosticar_conexao_evolution_go(config) -> Dict[str, Any]:
    """
    Executa diagnóstico da conexão com Evolution Go.

    Valida URL, token e nome da instância via GET /instance/{name}/status.
    """
    resultado: Dict[str, Any] = {
        "ok": False,
        "motivo": "configuracao_incompleta",
        "api_url": None,
        "instance": None,
        "status_http": None,
        "url_usada": None,
        "detalhe": None,
        "status_response": None,
        "qr_response": None,
        "qr_image": None,
        "conectado": None,
        "logado": None,
        "estilo_api": None,
        "validacao_instancia": None,
        "aviso": None,
    }

    api_url = (getattr(config, "evolution_api_url", "") or "").strip().rstrip("/")
    api_key = (getattr(config, "evolution_api_key", "") or "").strip()
    global_api_key = (getattr(config, "evolution_global_api_key", "") or "").strip()
    instance = (getattr(config, "evolution_api_instance", "") or "").strip()

    resultado["api_url"] = api_url or None
    resultado["instance"] = instance or None

    if not api_url or not api_key:
        return resultado

    if not instance:
        resultado["motivo"] = "instancia_nao_informada"
        resultado["detalhe"] = (
            "Informe o nome da instância para testar URL, token e instância juntos."
        )
        return resultado

    headers = _build_headers(api_key)
    base_urls = _build_base_urls(api_url)
    seg = _instance_path_segment(instance)
    ultimo_erro = None

    for base in base_urls:
        url_status_nome = f"{base}/instance/{seg}/status"
        resultado["url_usada"] = url_status_nome
        try:
            response = requests.get(url_status_nome, headers=headers, timeout=20)
            if _resposta_e_404_rota_inexistente(response):
                if _diagnosticar_evolution_go_por_token(
                    resultado,
                    base=base,
                    headers=headers,
                    instance=instance,
                    instance_token=api_key,
                    global_api_key=global_api_key,
                ):
                    return resultado
                ultimo_erro = resultado.get("detalhe")
                continue

            if _aplicar_resultado_status_instancia(
                resultado,
                response,
                base=base,
                headers=headers,
                instance=instance,
            ):
                return resultado
            ultimo_erro = resultado.get("detalhe")
        except Exception as exc:
            resultado["motivo"] = "requisicao_erro"
            resultado["detalhe"] = str(exc)
            ultimo_erro = str(exc)
            logger.warning(
                "Falha ao diagnosticar Evolution Go em %s: %s",
                url_status_nome,
                exc,
            )

    if ultimo_erro:
        resultado["detalhe"] = ultimo_erro
    return resultado

