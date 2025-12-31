/*
 * Copyright (c) 2025 PveSphere Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useEventListener } from "@vueuse/core";
import type { Directive, DirectiveBinding } from "vue";
import { subBefore, subAfter, isFunction } from "@pureadmin/utils";

export const longpress: Directive = {
  mounted(el: HTMLElement, binding: DirectiveBinding<Function>) {
    const cb = binding.value;
    if (cb && isFunction(cb)) {
      let timer = null;
      let interTimer = null;
      let num = 500;
      let interNum = null;
      const isInter = binding?.arg?.includes(":") ?? false;

      if (isInter) {
        num = Number(subBefore(binding.arg, ":"));
        interNum = Number(subAfter(binding.arg, ":"));
      } else if (binding.arg) {
        num = Number(binding.arg);
      }

      const clear = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (interTimer) {
          clearInterval(interTimer);
          interTimer = null;
        }
      };

      const onDownInter = (ev: PointerEvent) => {
        ev.preventDefault();
        if (interTimer === null) {
          interTimer = setInterval(() => cb(), interNum);
        }
      };

      const onDown = (ev: PointerEvent) => {
        clear();
        ev.preventDefault();
        if (timer === null) {
          timer = isInter
            ? setTimeout(() => {
                cb();
                onDownInter(ev);
              }, num)
            : setTimeout(() => cb(), num);
        }
      };

      // Register using addEventListener on mounted, and removeEventListener automatically on unmounted
      useEventListener(el, "pointerdown", onDown);
      useEventListener(el, "pointerup", clear);
      useEventListener(el, "pointerleave", clear);
    } else {
      throw new Error(
        '[Directive: longpress]: need callback and callback must be a function! Like v-longpress="callback"'
      );
    }
  }
};
