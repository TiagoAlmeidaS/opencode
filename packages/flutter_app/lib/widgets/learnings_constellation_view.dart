import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme/kinetic_tokens.dart';
import 'kinetic_glass_panel.dart';

class _NeuralHudBar extends StatelessWidget {
  const _NeuralHudBar({
    required this.count,
    required this.apiConnected,
    required this.daemonReachable,
  });

  final int count;
  final bool apiConnected;
  final bool daemonReachable;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: KineticTokens.surfaceContainerHigh.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(KineticTokens.radiusLg),
        border: const Border(
          left: BorderSide(color: KineticTokens.primaryContainer, width: 2),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'NEURAL STATUS',
                  style: GoogleFonts.inter(
                    fontSize: 10,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 2,
                    color: KineticTokens.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '$count learnings mapped by sector',
                  style: GoogleFonts.spaceGrotesk(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: KineticTokens.primary,
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: KineticTokens.primaryContainer.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: !apiConnected
                            ? KineticTokens.onSurfaceVariant
                            : daemonReachable
                                ? KineticTokens.primaryContainer
                                : Colors.orangeAccent,
                        boxShadow: apiConnected && daemonReachable
                            ? [
                                BoxShadow(
                                  color: KineticTokens.primaryContainer.withValues(alpha: 0.45),
                                  blurRadius: 6,
                                ),
                              ]
                            : null,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      !apiConnected
                          ? 'OFFLINE'
                          : daemonReachable
                              ? 'API_OK'
                              : 'NO_DAEMON',
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 9,
                        color: KineticTokens.primaryContainer,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 4),
              SizedBox(
                width: 160,
                child: Text(
                  !apiConnected
                      ? 'Sem cliente API — ligue o servidor nas definições.'
                      : daemonReachable
                          ? 'Dados: GET /learnings (cache ao refrescar).'
                          : 'API alcançável mas daemon inativo (status falhou).',
                  textAlign: TextAlign.right,
                  style: GoogleFonts.inter(
                    fontSize: 8,
                    height: 1.2,
                    color: KineticTokens.onSurfaceVariant.withValues(alpha: 0.85),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// 3D constellation / Obsidian-style graph for learnings: nodes in a sphere,
/// edges by k-nearest + light category chains; pan rotates, pinch scales.
class LearningsConstellationView extends StatefulWidget {
  const LearningsConstellationView({
    super.key,
    required this.items,
    this.onTapOutside,
    this.apiConnected = true,
    this.daemonReachable = true,
  });

  final List<Map<String, dynamic>> items;
  final VoidCallback? onTapOutside;
  /// `ServerApiClient` exists (URL configurada).
  final bool apiConnected;
  /// Último `GET /status` ao daemon respondeu (camada scheduler ativa).
  final bool daemonReachable;

  @override
  State<LearningsConstellationView> createState() => _LearningsConstellationViewState();
}

class _Vec3 {
  _Vec3(this.x, this.y, this.z);
  double x;
  double y;
  double z;

  _Vec3 rotateY(double a) {
    final c = math.cos(a);
    final s = math.sin(a);
    return _Vec3(x * c + z * s, y, -x * s + z * c);
  }

  _Vec3 rotateX(double a) {
    final c = math.cos(a);
    final s = math.sin(a);
    return _Vec3(x, y * c - z * s, y * s + z * c);
  }

  double dist2(_Vec3 o) {
    final dx = x - o.x;
    final dy = y - o.y;
    final dz = z - o.z;
    return dx * dx + dy * dy + dz * dz;
  }
}

class _LearningsConstellationViewState extends State<LearningsConstellationView> {
  double _yaw = 0.35;
  double _pitch = -0.15;
  double _zoom = 1.0;
  double _baseZoom = 1.0;
  int? _selected;
  late List<_Vec3> _base;
  late List<String> _categories;
  late List<double> _confidences;
  late List<String> _titles;
  late List<String> _ids;
  late List<List<int>> _edges;

  @override
  void initState() {
    super.initState();
    _rebuildLayout();
  }

  @override
  void didUpdateWidget(LearningsConstellationView old) {
    super.didUpdateWidget(old);
    if (_fp(old.items) != _fp(widget.items)) {
      _rebuildLayout();
      _selected = null;
    }
  }

  String _fp(List<Map<String, dynamic>> L) {
    if (L.isEmpty) return '0';
    final a = '${L.first['id'] ?? L.first['key'] ?? ''}';
    final b = '${L.last['id'] ?? L.last['key'] ?? ''}';
    return '${L.length}:$a:$b';
  }

  void _rebuildLayout() {
    final n = widget.items.length;
    _base = [];
    _categories = [];
    _confidences = [];
    _titles = [];
    _ids = [];
    if (n == 0) {
      _edges = [];
      return;
    }
    const r = 2.2;
    for (var i = 0; i < n; i++) {
      final m = widget.items[i];
      final id = '${m['id'] ?? m['key'] ?? i}';
      _ids.add(id);
      _titles.add((m['title'] as String?) ?? (m['key'] as String?) ?? 'Learning');
      _categories.add((m['category'] as String?) ?? '');
      _confidences.add((m['confidence'] as num?)?.toDouble() ?? 0.5);
      final h = _hash(id);
      final t = i / math.max(1, n - 1);
      final phi = math.acos(1 - 2 * (t + h * 0.02) % 1.0);
      final theta = h * 137.5 * math.pi / 180 + i * 2.3999632;
      final jx = (h % 1000) / 1000 * 0.24 - 0.12;
      final jy = ((h >> 8) % 1000) / 1000 * 0.24 - 0.12;
      final jz = ((h >> 16) % 1000) / 1000 * 0.18 - 0.09;
      _base.add(_Vec3(
        r * math.sin(phi) * math.cos(theta) + jx,
        r * math.sin(phi) * math.sin(theta) + jy,
        r * math.cos(phi) + jz,
      ));
    }
    _edges = _buildEdges(n);
  }

  int _hash(String s) {
    var h = 0;
    for (final c in s.codeUnits) {
      h = (h * 31 + c) & 0x7fffffff;
    }
    return h;
  }

  List<List<int>> _buildEdges(int n) {
    if (n < 2) return [];
    final out = <List<int>>[];
    final has = <String>{};

    void addE(int a, int b) {
      if (a > b) {
        final t = a;
        a = b;
        b = t;
      }
      final k = '$a-$b';
      if (has.add(k)) out.add([a, b]);
    }

    for (var i = 0; i < n; i++) {
      final d = <int, double>{};
      for (var j = 0; j < n; j++) {
        if (i != j) d[j] = _base[i].dist2(_base[j]);
      }
      final sorted = d.entries.toList()..sort((a, b) => a.value.compareTo(b.value));
      if (sorted.isNotEmpty) addE(i, sorted.first.key);
    }
    final byCat = <String, List<int>>{};
    for (var i = 0; i < n; i++) {
      final c = _categories[i];
      if (c.isEmpty) continue;
      byCat.putIfAbsent(c, () => []).add(i);
    }
    for (final list in byCat.values) {
      if (list.length < 2) continue;
      final sorted = [...list]..sort();
      for (var k = 0; k < sorted.length - 1; k++) {
        if (out.length >= 96) return out;
        addE(sorted[k], sorted[k + 1]);
      }
    }
    return out;
  }

  List<_Vec3> _transformed() {
    return _base.map((v) {
      var w = v.rotateY(_yaw).rotateX(_pitch);
      return w;
    }).toList();
  }

  Offset _project(_Vec3 v, Size size, double focal) {
    const camZ = 5.2;
    final z = v.z + camZ;
    if (z < 0.15) return Offset(size.width / 2, size.height / 2);
    final s = focal * _zoom / z;
    return Offset(size.width * 0.5 + v.x * s, size.height * 0.5 - v.y * s);
  }

  int? _hit(Offset p, Size size, double focal) {
    final pts = _transformed();
    var best = -1;
    var bestD = double.infinity;
    for (var i = 0; i < pts.length; i++) {
      final o = _project(pts[i], size, focal);
      final rad = 6 + 10 * _confidences[i];
      final d = (o - p).distance;
      if (d < rad + 14 && d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best < 0 ? null : best;
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.apiConnected) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.cloud_off_outlined, size: 48, color: KineticTokens.onSurfaceVariant),
              const SizedBox(height: 16),
              Text(
                'Brain sem ligação',
                style: GoogleFonts.spaceGrotesk(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: KineticTokens.onSurface,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Configura a URL do OpenCode e a base da API do daemon (ex.: …/api) para carregar learnings em GET /learnings.',
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(fontSize: 13, height: 1.4, color: KineticTokens.onSurfaceVariant),
              ),
            ],
          ),
        ),
      );
    }
    if (widget.items.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Nenhum learning para mapear',
                style: GoogleFonts.inter(color: KineticTokens.onSurfaceVariant, fontSize: 14),
              ),
              const SizedBox(height: 8),
              Text(
                'Com o daemon ativo, usa “Extrair” na vista em lista ou espera pelo pipeline de extração.',
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(fontSize: 12, color: KineticTokens.onSurfaceVariant.withValues(alpha: 0.8)),
              ),
            ],
          ),
        ),
      );
    }

    return LayoutBuilder(
      builder: (ctx, c) {
        final focal = c.maxWidth * 0.42;
        const hudTop = 72.0;
        final graphSize = Size(c.maxWidth, math.max(120.0, c.maxHeight - hudTop));
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onScaleStart: (d) {
            _baseZoom = _zoom;
          },
          onScaleUpdate: (d) {
            setState(() {
              _zoom = (_baseZoom * d.scale).clamp(0.45, 2.8);
              _yaw += d.focalPointDelta.dx * 0.0028;
              _pitch += d.focalPointDelta.dy * 0.0028;
              _pitch = _pitch.clamp(-1.1, 1.1);
            });
          },
          onTapDown: (d) {
            if (d.localPosition.dy < hudTop) {
              setState(() => _selected = null);
              return;
            }
            final lp = Offset(d.localPosition.dx, d.localPosition.dy - hudTop);
            final idx = _hit(lp, graphSize, focal);
            setState(() {
              _selected = idx;
              if (idx == null) widget.onTapOutside?.call();
            });
          },
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Positioned(
                top: 0,
                left: 12,
                right: 12,
                child: _NeuralHudBar(
                  count: widget.items.length,
                  apiConnected: widget.apiConnected,
                  daemonReachable: widget.daemonReachable,
                ),
              ),
              Positioned(
                top: hudTop,
                left: 0,
                right: 0,
                bottom: 0,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Positioned.fill(
                      child: RepaintBoundary(
                        child: CustomPaint(
                          painter: _ConstellationPainter(
                            points: _transformed(),
                            edges: _edges,
                            confidences: _confidences,
                            project: (v, size) => _project(v, size, focal),
                          ),
                        ),
                      ),
                    ),
                    ..._buildLabels(graphSize.width, graphSize.height, focal),
                  ],
                ),
              ),
              if (_selected != null) _detailCard(c.maxWidth, c.maxHeight, focal),
            ],
          ),
        );
      },
    );
  }

  List<Widget> _buildLabels(double w, double h, double focal) {
    final sel = _selected;
    if (sel == null) return [];
    final pts = _transformed();
    final i = sel;
    if (i < 0 || i >= pts.length) return [];
    final p = _project(pts[i], Size(w, h), focal);
    final conf = _confidences[i];
    final short = _titles[i].length > 36 ? '${_titles[i].substring(0, 34)}…' : _titles[i];
    return [
      Positioned(
        left: p.dx - 80,
        top: p.dy + 12,
        width: 160,
        child: IgnorePointer(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: KineticTokens.surfaceContainerHighest.withValues(alpha: 0.88),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: KineticTokens.primaryContainer.withValues(alpha: 0.35)),
            ),
            child: Text(
              short,
              textAlign: TextAlign.center,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.spaceGrotesk(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: conf >= 0.65 ? KineticTokens.primaryContainer : KineticTokens.onSurface,
              ),
            ),
          ),
        ),
      ),
    ];
  }

  Widget _detailCard(double w, double h, double focal) {
    final i = _selected!;
    final m = widget.items[i];
    final body = m['body'] as String? ?? '';
    final conf = (m['confidence'] as num?)?.toDouble() ?? 0.0;
    final cat = m['category'] as String? ?? 'neutral';
    final idShort = _ids[i].length > 8 ? _ids[i].substring(_ids[i].length - 6) : _ids[i];
    return Positioned(
      left: 16,
      right: 16,
      bottom: 24,
      child: Material(
        color: Colors.transparent,
        child: KineticGlassPanel(
          padding: const EdgeInsets.all(16),
          borderRadius: KineticTokens.radiusLg,
          child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      'LEARNING_$idShort',
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 10,
                        color: KineticTokens.primaryContainer,
                      ),
                    ),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: KineticTokens.surfaceContainerLowest,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: KineticTokens.outlineVariant.withValues(alpha: 0.2)),
                      ),
                      child: Text(
                        cat.toUpperCase(),
                        style: GoogleFonts.jetBrainsMono(
                          fontSize: 9,
                          color: KineticTokens.onSurfaceVariant,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  body.isNotEmpty ? (body.length > 220 ? '${body.substring(0, 220)}…' : body) : _titles[i],
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    height: 1.45,
                    color: KineticTokens.onSurface,
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(999),
                        child: LinearProgressIndicator(
                          value: conf.clamp(0.0, 1.0),
                          minHeight: 4,
                          backgroundColor: KineticTokens.surfaceContainer,
                          valueColor: AlwaysStoppedAnimation<Color>(
                            Color.lerp(KineticTokens.secondaryContainer, KineticTokens.primaryContainer, conf)!,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '${(conf * 100).round()}% CONF',
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 10,
                        color: KineticTokens.primaryContainer,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  'Deslize para rodar · pinça para zoom · toque num nó para detalhe',
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 9,
                    color: KineticTokens.onSurfaceVariant.withValues(alpha: 0.7),
                  ),
                ),
              ],
            ),
        ),
      ),
    );
  }
}

class _ConstellationPainter extends CustomPainter {
  _ConstellationPainter({
    required this.points,
    required this.edges,
    required this.confidences,
    required this.project,
  });

  final List<_Vec3> points;
  final List<List<int>> edges;
  final List<double> confidences;
  final Offset Function(_Vec3 v, Size size) project;

  @override
  void paint(Canvas canvas, Size size) {
    final bg = Paint()
      ..shader = RadialGradient(
        colors: [
          KineticTokens.surfaceContainer.withValues(alpha: 0.95),
          KineticTokens.background,
        ],
        stops: const [0.0, 1.0],
      ).createShader(Rect.fromCircle(center: Offset(size.width / 2, size.height / 2), radius: size.shortestSide));
    canvas.drawRect(Offset.zero & size, bg);

    final edgePaint = Paint()
      ..color = KineticTokens.outlineVariant.withValues(alpha: 0.35)
      ..strokeWidth = 0.8
      ..style = PaintingStyle.stroke;

    for (final e in edges) {
      final a = e[0];
      final b = e[1];
      if (a >= points.length || b >= points.length) continue;
      final pa = project(points[a], size);
      final pb = project(points[b], size);
      canvas.drawLine(pa, pb, edgePaint);
    }

    final sorted = List<int>.generate(points.length, (i) => i);
    sorted.sort((a, b) => points[a].z.compareTo(points[b].z));

    for (final i in sorted) {
      final p = project(points[i], size);
      final conf = confidences[i];
      final r = 3.5 + 7.0 * conf;
      final glow = Paint()
        ..color = KineticTokens.primaryContainer.withValues(alpha: 0.18 + 0.15 * conf)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5);
      canvas.drawCircle(p, r + 4, glow);

      final fill = Paint()..color = KineticTokens.primaryContainer.withValues(alpha: 0.55 + 0.45 * conf);
      canvas.drawCircle(p, r, fill);
      final ring = Paint()
        ..color = Colors.white.withValues(alpha: 0.35)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.8;
      canvas.drawCircle(p, r, ring);
    }
  }

  @override
  bool shouldRepaint(covariant _ConstellationPainter oldDelegate) {
    return oldDelegate.points != points || oldDelegate.edges != edges;
  }
}

