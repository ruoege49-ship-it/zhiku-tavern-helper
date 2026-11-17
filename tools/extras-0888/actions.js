            case 'lintbraces': {
                const f = el.dataset.f === 'neg' ? 'neg' : 'pos', before = ui.studio[f] || '', moved = f === 'pos' ? N.negWeighted(before) : [];
                ui.studio[f] = N.toBraces(before);
                if (moved.length) ui.studio.neg = [ui.studio.neg, moved.join(', ')].filter(s => String(s || '').trim()).join(', ');
                saveStudio(); render();
                toastr.success(`换成括号写法了${moved.length ? `，${moved.length} 处负权重挪进了负面` : ''}，发送前再看一眼`, '智库', { timeOut: 2500 });
                break;
            }
            case 'bracestring': {
                const g = d.groups[el.dataset.id];
                if (!g) break;
                const raw = M.ticketString(d, { type: 'group', id: g.id });
                if (!N.countWeightBlocks(raw)) { toastr.info('这串没有「N::」权重，不用转', '智库'); break; }
                const moved = N.negWeighted(raw);
                const text = await promptText(`转成括号写法（V4.5 用，可以再改）${moved.length ? ` · 去掉了 ${moved.length} 处负权重：${moved.join('、')}，建议写进这串的负面` : ''}`, N.toBraces(raw), true);
                if (text == null || !text.trim()) break;
                const mode = await chooseBox('保存画师串', ['覆盖原串：' + g.name, '另存为新画师串']);
                if (mode == null) break;
                const neg = moved.length ? [g.neg, moved.join(', ')].filter(s => String(s || '').trim()).join(', ') : g.neg;
                if (mode === 0) M.overwriteGroup(d, { type: 'group', id: g.id }, text, neg);
                else {
                    const name = await promptText('新画师串的名字', g.name + ' · 括号版');
                    if (name == null) break;
                    const ref = M.createFromString(d, { name, text, neg, forceGroup: true });
                    if (ref) { ui.detailId = ref.id; ui.view = 'group'; }
                }
                await commit({ immediate: true });
                break;
            }
