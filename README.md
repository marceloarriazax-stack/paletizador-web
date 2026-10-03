# Paletizador de cajas

Página web sencilla para calcular cuántas cajas caben en un pallet y cuántas capas pueden apilarse sin exceder la altura máxima.

## Cómo usar

1. Abre `index.html` en el navegador.
2. Ingresa las medidas de la caja.
3. Ajusta el tamaño del pallet y la altura máxima.
4. Presiona `Calcular`.

## Reglas de cálculo

- El pallet tiene 1.2 m de largo, 1.0 m de ancho y 0.13 m de espesor.
- La altura máxima permitida es 1.6 m.
- La última capa no puede superar la altura máxima, considerando el espesor del pallet.
- Las capas se suponen iguales en todos los niveles.

## Ejemplo

La página incluye un ejemplo predeterminado con una caja de 0.4 × 0.3 × 0.2 m.

## Estructura

- `index.html`: contenido principal de la página.
- `styles.css`: estilos visuales de la interfaz.
- `script.js`: lógica de cálculo y resultados.

## Nota

Este cálculo hace una aproximación por disposición en rejilla y orientación de la caja, útil para una primera estimación de paletizado.
