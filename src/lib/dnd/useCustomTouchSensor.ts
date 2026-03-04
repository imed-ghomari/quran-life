import { useRef, useCallback, useEffect } from 'react';
import type {
  SensorAPI,
  PreDragActions,
  FluidDragActions,
  DraggableId,
} from '@hello-pangea/dnd';

// Define locally to avoid dependency on css-box-model
interface Position {
  x: number;
  y: number;
}

// Increased delay to prevent accidental drags when scrolling
const TIME_FOR_LONG_PRESS = 400; // 400ms (default was 120ms)

interface Idle {
  type: 'IDLE';
}

interface Pending {
  type: 'PENDING';
  point: Position;
  actions: PreDragActions;
  longPressTimerId: NodeJS.Timeout;
}

interface Dragging {
  type: 'DRAGGING';
  actions: FluidDragActions;
  hasMoved: boolean;
}

type Phase = Idle | Pending | Dragging;

const idle: Idle = { type: 'IDLE' };

export function useCustomTouchSensor(api: SensorAPI) {
  const phaseRef = useRef<Phase>(idle);
  const unbindEventsRef = useRef<() => void>(() => {});
  const moveFrameRef = useRef<number | null>(null);
  const pendingMovePointRef = useRef<Position | null>(null);

  const getPhase = useCallback(function getPhase(): Phase {
    return phaseRef.current;
  }, []);

  const setPhase = useCallback(function setPhase(phase: Phase) {
    phaseRef.current = phase;
  }, []);

  const stop = useCallback(() => {
    const current: Phase = phaseRef.current;
    if (current.type === 'IDLE') {
      return;
    }

    // aborting any pending drag
    if (current.type === 'PENDING') {
      clearTimeout(current.longPressTimerId);
    }

    if (moveFrameRef.current !== null) {
      window.cancelAnimationFrame(moveFrameRef.current);
      moveFrameRef.current = null;
    }
    pendingMovePointRef.current = null;

    setPhase(idle);
    unbindEventsRef.current();
    unbindEventsRef.current = () => {};

    // Re-bind capture listener
    listenForCapture();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = useCallback(() => {
    const phase: Phase = phaseRef.current;
    stop();
    if (phase.type === 'DRAGGING') {
      phase.actions.cancel({ shouldBlockNextClick: true });
    }
    if (phase.type === 'PENDING') {
      phase.actions.abort();
    }
  }, [stop]);

  const startDragging = useCallback(
    function startDragging() {
      const phase: Phase = getPhase();
      if (phase.type !== 'PENDING') {
        return;
      }

      const actions: FluidDragActions = phase.actions.fluidLift(phase.point);

      setPhase({
        type: 'DRAGGING',
        actions,
        hasMoved: false,
      });
    },
    [getPhase, setPhase],
  );

  const bindCapturingEvents = useCallback(
    function bindCapturingEvents() {
      const flushMove = () => {
        moveFrameRef.current = null;
        const phase: Phase = getPhase();
        const point = pendingMovePointRef.current;
        pendingMovePointRef.current = null;

        if (!point || phase.type !== 'DRAGGING') {
          return;
        }
        phase.actions.move(point);
      };

      const onTouchMove = (event: TouchEvent) => {
        const phase: Phase = getPhase();
        if (phase.type !== 'DRAGGING') {
          cancel();
          return;
        }

        phase.hasMoved = true;
        const { clientX, clientY } = event.touches[0];
        pendingMovePointRef.current = { x: clientX, y: clientY };

        event.preventDefault();
        if (moveFrameRef.current === null) {
          moveFrameRef.current = window.requestAnimationFrame(flushMove);
        }
      };

      const onTouchEnd = (event: TouchEvent) => {
        const phase: Phase = getPhase();
        if (phase.type !== 'DRAGGING') {
          cancel();
          return;
        }

        event.preventDefault();
        phase.actions.drop({ shouldBlockNextClick: true });
        stop();
      };

      const onTouchCancel = (event: TouchEvent) => {
        if (getPhase().type !== 'DRAGGING') {
            cancel();
            return;
        }
        event.preventDefault();
        cancel();
      };

      const onContextMenu = (event: Event) => {
        event.preventDefault();
      };

      // Bind to window for drag events
      // Using passive: false to allow preventDefault
      const options = { capture: true, passive: false };
      
      window.addEventListener('touchmove', onTouchMove, options);
      window.addEventListener('touchend', onTouchEnd, options);
      window.addEventListener('touchcancel', onTouchCancel, options);
      // Also bind to orientation change / resize to cancel
      window.addEventListener('orientationchange', cancel);
      window.addEventListener('resize', cancel);
      window.addEventListener('contextmenu', onContextMenu);

      unbindEventsRef.current = function unbindAll() {
        if (moveFrameRef.current !== null) {
          window.cancelAnimationFrame(moveFrameRef.current);
          moveFrameRef.current = null;
        }
        pendingMovePointRef.current = null;
        window.removeEventListener('touchmove', onTouchMove, options as any);
        window.removeEventListener('touchend', onTouchEnd, options as any);
        window.removeEventListener('touchcancel', onTouchCancel, options as any);
        window.removeEventListener('orientationchange', cancel);
        window.removeEventListener('resize', cancel);
        window.removeEventListener('contextmenu', onContextMenu);
      };
    },
    [cancel, getPhase, stop],
  );

  const startPendingDrag = useCallback(
    function startPendingDrag(actions: PreDragActions, point: Position) {
      const longPressTimerId = setTimeout(
        startDragging,
        TIME_FOR_LONG_PRESS,
      );

      setPhase({
        type: 'PENDING',
        point,
        actions,
        longPressTimerId,
      });

      bindCapturingEvents();
    },
    [bindCapturingEvents, setPhase, startDragging],
  );

  const listenForCapture = useCallback(
    function listenForCapture() {
      const onTouchStart = (event: TouchEvent) => {
        if (event.defaultPrevented) {
          return;
        }

        const draggableId: DraggableId | null = api.findClosestDraggableId(event);
        if (!draggableId) {
          return;
        }

        const actions: PreDragActions | null = api.tryGetLock(
          draggableId,
          stop,
          { sourceEvent: event },
        );

        if (!actions) {
          return;
        }

        const touch: Touch = event.touches[0];
        const { clientX, clientY } = touch;
        const point: Position = { x: clientX, y: clientY };

        // Unbind the capture listener while we are processing this potential drag
        unbindEventsRef.current();

        startPendingDrag(actions, point);
      };

      const options = { capture: true, passive: false };
      window.addEventListener('touchstart', onTouchStart, options);

      unbindEventsRef.current = () => {
        window.removeEventListener('touchstart', onTouchStart, options as any);
      };
    },
    [api, stop, startPendingDrag],
  );

  useEffect(() => {
    listenForCapture();
    return () => {
      unbindEventsRef.current();
    };
  }, [listenForCapture]);
}
