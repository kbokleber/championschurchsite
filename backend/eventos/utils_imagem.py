"""
Utilitários para processamento de imagens (logos, etc.).
"""
import os
from PIL import Image

# Pixel totalmente transparente (fundo do logo fica transparente; a cor do header vem do CSS)
TRANSPARENT = (0, 0, 0, 0)


def substituir_fundo_logo_por_navy(file_path):
    """
    Torna transparentes apenas: (1) pixels já semi-transparentes e (2) azul gravado
    pela versão antiga do processamento. Não mexe em branco/cinza para não apagar
    texto ou desenho do logo (ex.: CHAMPIONS em branco).
    """
    if not file_path or not os.path.isfile(file_path):
        return
    ext = os.path.splitext(file_path)[1].lower()
    if ext != '.png':
        return
    try:
        img = Image.open(file_path).convert('RGBA')
        pixels = img.load()
        w, h = img.size
        for y in range(h):
            for x in range(w):
                r, g, b, a = pixels[x, y]
                # Só transparente: fundo já transparente
                if a < 200:
                    pixels[x, y] = TRANSPARENT
                # Azul gravado pela versão antiga (navy #1a365d)
                elif abs(r - 26) <= 25 and abs(g - 54) <= 25 and abs(b - 93) <= 25:
                    pixels[x, y] = TRANSPARENT
        img.save(file_path, 'PNG', optimize=False)
    except Exception:
        pass
