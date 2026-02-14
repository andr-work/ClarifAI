const ClarifaiPositioning = (() => {
    function positionRootNearSelection(root, getSelectionRect, pointer) {
        const rect = getSelectionRect();
        if (!rect) {
            return false;
        }

        const margin = 10;
        const panelWidth = 360;
        const iconSize = 32;
        const scrollX = window.scrollX || window.pageXOffset || 0;
        const scrollY = window.scrollY || window.pageYOffset || 0;
        const viewportLeft = scrollX;
        const viewportTop = scrollY;
        const viewportRight = scrollX + window.innerWidth;
        const viewportBottom = scrollY + window.innerHeight;
        const hasPointer =
            Number.isFinite(pointer?.x) && Number.isFinite(pointer?.y);

        const pointerLeft = hasPointer ? pointer.x + scrollX : rect.right + scrollX;
        const pointerTop = hasPointer ? pointer.y + scrollY : rect.bottom + scrollY;

        let left = pointerLeft + margin;
        let top = pointerTop + margin;

        if (left + panelWidth > viewportRight - margin) {
            left = viewportRight - panelWidth - margin;
        }
        if (left < viewportLeft + margin) {
            left = viewportLeft + margin;
        }

        if (top + iconSize > viewportBottom - margin) {
            top = rect.top + scrollY - iconSize - margin;
        }
        if (top < viewportTop + margin) {
            top = viewportTop + margin;
        }

        const iconRight = left + iconSize;
        const iconBottom = top + iconSize;
        const overlapsSelection =
            iconRight > rect.left &&
            left < rect.right &&
            iconBottom > rect.top &&
            top < rect.bottom;

        if (overlapsSelection) {
            const belowTop = rect.bottom + scrollY + margin;
            const aboveTop = rect.top + scrollY - iconSize - margin;
            if (belowTop + iconSize <= viewportBottom - margin) {
                top = belowTop;
            } else if (aboveTop >= viewportTop + margin) {
                top = aboveTop;
            } else {
                top = viewportTop + margin;
            }
        }

        root.style.left = `${left}px`;
        root.style.top = `${top}px`;
        return true;
    }

    return {
        positionRootNearSelection,
    };
})();

self.ClarifaiPositioning = ClarifaiPositioning;
