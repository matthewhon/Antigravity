/**
 * PhoneStackPanes — master/detail that becomes a SwipeStack on phones.
 *
 *   <PhoneStackPanes isPhone showDetail={!!active} detailKey={active?.id} onPop={…}>
 *     {listPane}
 *     {detailPane}
 *   </PhoneStackPanes>
 *
 * Tablet/desktop: renders both children side by side, unchanged.
 * Phone: list and detail become two swipe-back screens.
 */
import React, { forwardRef } from 'react';
import { SwipeStack, SwipeStackHandle } from './SwipeStack';

interface PhoneStackPanesProps {
    isPhone: boolean;
    showDetail: boolean;
    detailKey?: string;
    onPop: () => void;
    children: [React.ReactNode, React.ReactNode];
}

export const PhoneStackPanes = forwardRef<SwipeStackHandle, PhoneStackPanesProps>(
    ({ isPhone, showDetail, detailKey, onPop, children }, ref) => {
        const [master, detail] = children;
        if (!isPhone) return <>{master}{detail}</>;
        const views = [
            { key: 'master', node: master },
            ...(showDetail ? [{ key: `detail-${detailKey || 'item'}`, node: detail }] : []),
        ];
        return (
            <div className="flex-1 min-w-0 h-full">
                <SwipeStack ref={ref} views={views} onPop={n => { if (n <= 1) onPop(); }} />
            </div>
        );
    },
);
PhoneStackPanes.displayName = 'PhoneStackPanes';

