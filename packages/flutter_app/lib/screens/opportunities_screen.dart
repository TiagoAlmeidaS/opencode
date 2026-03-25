import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../screens/job_detail_screen.dart';
import '../theme/button_style.dart';
import '../theme/kinetic_tokens.dart';
import '../theme/oc2_colors.dart';
import '../widgets/kinetic_glass_panel.dart';
import '../widgets/kinetic_ui.dart';
import '../widgets/opencode_button.dart';

class OpportunitiesScreen extends StatefulWidget {
  const OpportunitiesScreen({super.key});

  @override
  State<OpportunitiesScreen> createState() => _OpportunitiesScreenState();
}

class _OpportunitiesScreenState extends State<OpportunitiesScreen> {
  List<Map<String, dynamic>>? _opportunities;
  Map<String, dynamic>? _stats;
  bool _loading = true;
  String _filter = 'all';

  static const _statuses = ['all', 'new', 'scored', 'shortlisted', 'applied', 'won', 'ignored'];

  static const _kineticVersion = 'v1.0.0-beta';

  Oc2Palette get _palette =>
      Theme.of(context).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final srv = context.read<AppState>().server;
    if (srv == null) {
      setState(() => _loading = false);
      return;
    }
    final results = await Future.wait([
      srv.opportunitiesStats(),
      srv.opportunities(
        status: _filter == 'all' ? null : _filter,
        limit: 100,
      ),
    ]);
    if (!mounted) return;
    setState(() {
      _stats = results[0] as Map<String, dynamic>?;
      _opportunities = results[1] as List<Map<String, dynamic>>?;
      _loading = false;
    });
  }

  Future<void> _shortlist(String id) async {
    final srv = context.read<AppState>().server;
    if (srv == null) return;
    final ok = await srv.opportunityShortlist(id);
    if (!mounted) return;
    if (ok) await _load();
  }

  Future<void> _ignore(String id) async {
    final srv = context.read<AppState>().server;
    if (srv == null) return;
    final ok = await srv.opportunityIgnore(id);
    if (!mounted) return;
    if (ok) await _load();
  }

  Future<void> _execute(String id, String title) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Launch dev cycle?'),
        content: Text('This will create a job and start the full implementation pipeline for:\n\n"$title"'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Launch'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    final srv = context.read<AppState>().server;
    if (srv == null) return;
    final result = await srv.opportunityExecute(id);
    if (!mounted) return;
    if (result != null && result['id'] != null) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => JobDetailScreen(jobId: result['id'] as String),
        ),
      );
    } else {
      final errMsg = result?['error'] as String? ?? 'Failed to launch dev cycle';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(errMsg), backgroundColor: Colors.red),
      );
    }
  }

  Color _scoreColor(double score) {
    if (score >= 70) return KineticTokens.healthIntegrity;
    if (score >= 40) return Colors.orange;
    return Colors.redAccent;
  }

  Color _typeAccent(String type) {
    switch (type) {
      case 'bug-bounty':
        return KineticTokens.error;
      case 'freelance':
        return KineticTokens.secondaryContainer;
      case 'grant':
        return KineticTokens.healthIntegrity;
      case 'oss-bounty':
        return KineticTokens.primary;
      case 'content':
        return KineticTokens.primaryFixedDim;
      default:
        return KineticTokens.onSurfaceVariant;
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = _palette;
    final stats = _stats;
    final k = isKineticDark(context);
    if (k) {
      return Scaffold(
        backgroundColor: KineticTokens.background,
        body: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _kineticTopBar(context),
              Expanded(
                child: _loading
                    ? const Center(child: CircularProgressIndicator(color: KineticTokens.primaryContainer))
                    : CustomScrollView(
                        slivers: [
                          SliverPadding(
                            padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                            sliver: SliverToBoxAdapter(child: _kineticHero(context)),
                          ),
                          SliverPadding(
                            padding: const EdgeInsets.fromLTRB(12, 20, 12, 12),
                            sliver: SliverToBoxAdapter(child: _kineticFilterRow()),
                          ),
                          if (_opportunities == null || _opportunities!.isEmpty)
                            SliverFillRemaining(
                              hasScrollBody: false,
                              child: Center(
                                child: Text(
                                  'Nenhuma oportunidade',
                                  style: GoogleFonts.inter(color: KineticTokens.onSurfaceVariant, fontSize: 14),
                                ),
                              ),
                            )
                          else
                            SliverPadding(
                              padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                              sliver: SliverList(
                                delegate: SliverChildBuilderDelegate(
                                  (ctx, i) {
                                    final opp = _opportunities![i];
                                    if (i == 0) {
                                      return _buildKineticFeaturedCard(context, opp);
                                    }
                                    return _buildKineticStandardCard(context, opp);
                                  },
                                  childCount: _opportunities!.length,
                                ),
                              ),
                            ),
                        ],
                      ),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: palette.backgroundBase,
      appBar: AppBar(
        backgroundColor: palette.backgroundBase,
        foregroundColor: palette.textStrong,
        title: const Text('Oportunidades'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: _load,
          ),
        ],
      ),
      body: Column(
        children: [
          if (stats != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              color: palette.backgroundWeak,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _statChip('new', _byStatus(stats, 'new'), Colors.blue, false),
                  _statChip('scored', _byStatus(stats, 'scored'), Colors.orange, false),
                  _statChip('shortlisted', _byStatus(stats, 'shortlisted'), Colors.purple, false),
                  _statChip('applied', _byStatus(stats, 'applied'), Colors.teal, false),
                  _statChip('won', _byStatus(stats, 'won'), Colors.green, false),
                ],
              ),
            ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: _statuses.map((s) {
                  final selected = _filter == s;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilterChip(
                      label: Text(s),
                      selected: selected,
                      onSelected: (_) {
                        setState(() => _filter = s);
                        _load();
                      },
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : (_opportunities == null || _opportunities!.isEmpty)
                    ? Center(
                        child: Text(
                          'Nenhuma oportunidade',
                          style: TextStyle(color: palette.textWeak),
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _opportunities!.length,
                        itemBuilder: (ctx, i) => _buildClassicCard(context, palette, _opportunities![i]),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _kineticTopBar(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 8, 4),
      child: Row(
        children: [
          Icon(Icons.terminal, color: KineticTokens.primaryContainer, size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'OPEN_CODE_TERMINAL',
              style: GoogleFonts.spaceGrotesk(
                fontWeight: FontWeight.w700,
                fontSize: 14,
                letterSpacing: 1.2,
                color: KineticTokens.primaryContainer,
              ),
            ),
          ),
          IconButton(
            icon: Icon(Icons.search, color: KineticTokens.onSurfaceVariant),
            tooltip: 'Search',
            onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Search — em breve')),
            ),
          ),
          IconButton(
            icon: Icon(Icons.notifications_outlined, color: KineticTokens.onSurfaceVariant),
            tooltip: 'Notifications',
            onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Notifications — em breve')),
            ),
          ),
          IconButton(
            icon: Icon(Icons.refresh, color: KineticTokens.primaryFixedDim),
            tooltip: 'Refresh',
            onPressed: _load,
          ),
        ],
      ),
    );
  }

  Widget _kineticHero(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'SYSTEM STATUS: ACTIVE',
          style: GoogleFonts.jetBrainsMono(
            fontSize: 11,
            letterSpacing: 2,
            color: KineticTokens.primary,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'AI_OPPORTUNITIES_CORE',
          style: GoogleFonts.spaceGrotesk(
            fontSize: 30,
            fontWeight: FontWeight.w700,
            height: 1.05,
            letterSpacing: -0.5,
            color: KineticTokens.onSurface,
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: KineticTokens.primaryContainer,
                boxShadow: [
                  BoxShadow(
                    color: KineticTokens.primaryContainer.withValues(alpha: 0.55),
                    blurRadius: 8,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(
              'LIVE_FEED',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 12,
                color: KineticTokens.onSurfaceVariant,
              ),
            ),
            const SizedBox(width: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: KineticTokens.surfaceContainerHigh,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                _kineticVersion,
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 11,
                  color: KineticTokens.onSurfaceVariant,
                ),
              ),
            ),
            if (_stats != null) ...[
              const SizedBox(width: 12),
              Text(
                '${_stats!['total'] ?? 0} OPPS',
                style: GoogleFonts.jetBrainsMono(fontSize: 10, color: KineticTokens.onSurfaceVariant),
              ),
            ],
          ],
        ),
      ],
    );
  }

  Widget _kineticFilterRow() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: _statuses.map((s) {
          final selected = _filter == s;
          return Padding(
            padding: const EdgeInsets.only(right: 10),
            child: KineticFilledFilterChip(
              label: s,
              selected: selected,
              onTap: () {
                setState(() => _filter = s);
                _load();
              },
            ),
          );
        }).toList(),
      ),
    );
  }

  static int _byStatus(Map<String, dynamic> stats, String status) {
    final m = stats['by_status'];
    if (m is Map) return (m[status] as num?)?.toInt() ?? 0;
    return 0;
  }

  Widget _statChip(String label, dynamic count, Color color, bool kinetic) {
    return Column(
      children: [
        Text(
          '$count',
          style: kinetic
              ? GoogleFonts.spaceGrotesk(fontWeight: FontWeight.w700, color: color, fontSize: 17)
              : TextStyle(fontWeight: FontWeight.bold, color: color, fontSize: 16),
        ),
        Text(
          label,
          style: kinetic
              ? GoogleFonts.jetBrainsMono(fontSize: 9, color: KineticTokens.onSurfaceVariant, letterSpacing: 0.4)
              : TextStyle(fontSize: 10, color: _palette.textWeak),
        ),
      ],
    );
  }

  String _shortId(String id) {
    if (id.length <= 10) return id;
    return id.substring(id.length - 8);
  }

  String _allocationLine(Map<String, dynamic> opp) {
    final min = opp['rewardMin'] ?? opp['reward_min'];
    final max = opp['rewardMax'] ?? opp['reward_max'];
    final cur = opp['rewardCurrency'] ?? opp['reward_currency'] ?? 'USD';
    if (min != null && max != null) return '$min–$max $cur';
    if (min != null) return '$min $cur';
    if (max != null) return '$max $cur';
    return '—';
  }

  String? _descriptionLine(Map<String, dynamic> opp) {
    final d = opp['description'] as String?;
    if (d != null && d.trim().isNotEmpty) return d.trim();
    return null;
  }

  Widget _healthRow(double score) {
    final pct = score.clamp(0.0, 100.0);
    final c = _scoreColor(score);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'HEALTH_INTEGRITY',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 10,
                letterSpacing: 0.6,
                color: KineticTokens.onSurfaceVariant,
              ),
            ),
            Text(
              '${pct.toStringAsFixed(1)}%',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: c,
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(
            value: pct / 100.0,
            minHeight: 4,
            backgroundColor: KineticTokens.surfaceContainerHighest,
            color: c,
          ),
        ),
      ],
    );
  }

  Widget _kineticLaunchButton(VoidCallback? onPressed) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(12),
        child: Ink(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [KineticTokens.primary, KineticTokens.primaryContainer],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: KineticTokens.primaryContainer.withValues(alpha: 0.35),
                blurRadius: 12,
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.rocket_launch_outlined, size: 16, color: KineticTokens.onPrimaryFixed),
                const SizedBox(width: 6),
                Text(
                  'LAUNCH_DEV_CYCLE',
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.2,
                    color: KineticTokens.onPrimaryFixed,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildKineticFeaturedCard(BuildContext context, Map<String, dynamic> opp) {
    final id = opp['id'] as String? ?? '';
    final title = opp['title'] as String? ?? '-';
    final type = opp['type'] as String? ?? opp['opportunity_type'] as String? ?? 'unknown';
    final status = opp['status'] as String? ?? 'new';
    final scoreRaw = opp['score'] ?? opp['fit_score'];
    final score = (scoreRaw as num?)?.toDouble() ?? 0.0;
    final accent = _typeAccent(type);
    final showActions = status == 'new' || status == 'scored';
    final showExecute = status == 'shortlisted';
    final desc = _descriptionLine(opp);
    final priority = score >= 88;

    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: KineticGlassPanel(
        padding: EdgeInsets.zero,
        borderRadius: KineticTokens.radiusXl,
        border: Border.all(color: KineticTokens.primaryContainer.withValues(alpha: 0.12)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            LayoutBuilder(
              builder: (ctx, c) {
                final wide = c.maxWidth > 520;
                if (wide) {
                  return IntrinsicHeight(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Expanded(
                          flex: 2,
                          child: _kineticFeaturedVisual(narrow: false),
                        ),
                        Expanded(
                          flex: 3,
                          child: _kineticFeaturedBody(
                            opp: opp,
                            title: title,
                            type: type,
                            status: status,
                            score: score,
                            accent: accent,
                            desc: desc,
                            showActions: showActions,
                            showExecute: showExecute,
                            priority: priority,
                            id: id,
                          ),
                        ),
                      ],
                    ),
                  );
                }
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SizedBox(height: 160, child: _kineticFeaturedVisual(narrow: true)),
                    _kineticFeaturedBody(
                      opp: opp,
                      title: title,
                      type: type,
                      status: status,
                      score: score,
                      accent: accent,
                      desc: desc,
                      showActions: showActions,
                      showExecute: showExecute,
                      priority: priority,
                      id: id,
                    ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _kineticFeaturedVisual({required bool narrow}) {
    final r = BorderRadius.only(
      topLeft: const Radius.circular(KineticTokens.radiusXl),
      topRight: Radius.circular(narrow ? KineticTokens.radiusXl : 0),
      bottomLeft: Radius.circular(narrow ? 0 : KineticTokens.radiusXl),
      bottomRight: Radius.circular(narrow ? 0 : KineticTokens.radiusXl),
    );
    return ClipRRect(
      borderRadius: r,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  KineticTokens.surfaceContainerHighest,
                  KineticTokens.secondaryContainer.withValues(alpha: 0.35),
                  KineticTokens.surfaceContainer,
                ],
              ),
            ),
          ),
          CustomPaint(painter: _GridGlowPainter()),
          Align(
            alignment: Alignment.center,
            child: Icon(
              Icons.hub_outlined,
              size: 56,
              color: KineticTokens.primaryContainer.withValues(alpha: 0.35),
            ),
          ),
        ],
      ),
    );
  }

  Widget _kineticFeaturedBody({
    required Map<String, dynamic> opp,
    required String title,
    required String type,
    required String status,
    required double score,
    required Color accent,
    required String? desc,
    required bool showActions,
    required bool showExecute,
    required bool priority,
    required String id,
  }) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (priority)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: KineticTokens.error.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: KineticTokens.error.withValues(alpha: 0.35)),
                  ),
                  child: Text(
                    'PRIORITY-CRITICAL',
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      color: KineticTokens.error,
                    ),
                  ),
                ),
              Text(
                'URGENT_ALLOCATION',
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 10,
                  color: KineticTokens.primaryFixedDim,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            title,
            style: GoogleFonts.spaceGrotesk(
              fontSize: 22,
              fontWeight: FontWeight.w700,
              color: KineticTokens.onSurface,
              height: 1.2,
            ),
          ),
          if (desc != null) ...[
            const SizedBox(height: 10),
            Text(
              desc,
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.inter(
                fontSize: 13,
                height: 1.45,
                color: KineticTokens.onSurfaceVariant,
              ),
            ),
          ],
          const SizedBox(height: 16),
          _healthRow(score),
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'ALLOCATION',
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 9,
                        letterSpacing: 0.5,
                        color: KineticTokens.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      priority ? '${_allocationLine(opp)} · STAKE' : _allocationLine(opp),
                      style: GoogleFonts.spaceGrotesk(
                        fontSize: priority ? 18 : 15,
                        fontWeight: FontWeight.w700,
                        color: priority ? KineticTokens.healthIntegrity : KineticTokens.primaryContainer,
                      ),
                    ),
                  ],
                ),
              ),
              if (showExecute) _kineticLaunchButton(() => _execute(id, title)),
            ],
          ),
          if (showActions) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                TextButton(
                  onPressed: () => _shortlist(id),
                  child: Text('SHORTLIST', style: GoogleFonts.jetBrainsMono(fontSize: 10, color: KineticTokens.primaryContainer)),
                ),
                TextButton(
                  onPressed: () => _ignore(id),
                  child: Text('IGNORE', style: GoogleFonts.jetBrainsMono(fontSize: 10, color: KineticTokens.onSurfaceVariant)),
                ),
              ],
            ),
          ],
          if (!showExecute && !showActions)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                status.toUpperCase(),
                style: GoogleFonts.jetBrainsMono(fontSize: 9, color: KineticTokens.onSurfaceVariant),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildKineticStandardCard(BuildContext context, Map<String, dynamic> opp) {
    final id = opp['id'] as String? ?? '';
    final title = opp['title'] as String? ?? '-';
    final type = opp['type'] as String? ?? opp['opportunity_type'] as String? ?? 'unknown';
    final status = opp['status'] as String? ?? 'new';
    final scoreRaw = opp['score'] ?? opp['fit_score'];
    final score = (scoreRaw as num?)?.toDouble() ?? 0.0;
    final accent = _typeAccent(type);
    final showActions = status == 'new' || status == 'scored';
    final showExecute = status == 'shortlisted';
    final desc = _descriptionLine(opp);

    final column = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: accent.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: accent.withValues(alpha: 0.25)),
              ),
              child: Text(
                type.replaceAll('-', '_').toUpperCase(),
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.4,
                  color: accent,
                ),
              ),
            ),
            const Spacer(),
            Text(
              'ID: ${_shortId(id)}',
              style: GoogleFonts.jetBrainsMono(fontSize: 11, color: KineticTokens.onSurfaceVariant),
            ),
          ],
        ),
        const SizedBox(height: 14),
        Text(
          title,
          style: GoogleFonts.spaceGrotesk(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            height: 1.2,
            color: KineticTokens.onSurface,
          ),
        ),
        if (desc != null) ...[
          const SizedBox(height: 10),
          Text(
            desc,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.inter(fontSize: 13, height: 1.4, color: KineticTokens.onSurfaceVariant),
          ),
        ],
        const SizedBox(height: 18),
        _healthRow(score),
        const SizedBox(height: 18),
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'ALLOCATION',
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 9,
                      letterSpacing: 0.5,
                      color: KineticTokens.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _allocationLine(opp),
                    style: GoogleFonts.spaceGrotesk(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: KineticTokens.primaryContainer,
                    ),
                  ),
                ],
              ),
            ),
            if (showExecute) _kineticLaunchButton(() => _execute(id, title)),
          ],
        ),
        if (showActions) ...[
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            children: [
              TextButton(
                onPressed: () => _shortlist(id),
                child: Text('SHORTLIST', style: GoogleFonts.jetBrainsMono(fontSize: 10, color: KineticTokens.primaryContainer)),
              ),
              TextButton(
                onPressed: () => _ignore(id),
                child: Text('IGNORE', style: GoogleFonts.jetBrainsMono(fontSize: 10, color: KineticTokens.onSurfaceVariant)),
              ),
            ],
          ),
        ],
        if (!showExecute && !showActions)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              status.toUpperCase(),
              style: GoogleFonts.jetBrainsMono(fontSize: 9, color: KineticTokens.onSurfaceVariant),
            ),
          ),
      ],
    );

    return KineticGlassCard(
      marginBottom: 16,
      padding: const EdgeInsets.all(20),
      child: column,
    );
  }

  Widget _buildClassicCard(BuildContext context, Oc2Palette palette, Map<String, dynamic> opp) {
    final id = opp['id'] as String? ?? '';
    final title = opp['title'] as String? ?? '-';
    final type = opp['type'] as String? ?? opp['opportunity_type'] as String? ?? 'unknown';
    final platform = opp['platform'] as String? ?? opp['source_platform'] as String?;
    final status = opp['status'] as String? ?? 'new';
    final scoreRaw = opp['score'] ?? opp['fit_score'];
    final score = (scoreRaw as num?)?.toDouble() ?? 0.0;
    final rewardMin = opp['reward_min'] ?? opp['rewardMin'];
    final rewardMax = opp['reward_max'] ?? opp['rewardMax'];
    final currency = opp['reward_currency'] ?? opp['rewardCurrency'] ?? 'USD';

    final typeColor = _typeAccent(type);
    final scoreColor = _scoreColor(score);
    final showActions = status == 'new' || status == 'scored';
    final showExecute = status == 'shortlisted';

    final column = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: typeColor.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                type,
                style: TextStyle(fontSize: 11, color: typeColor, fontWeight: FontWeight.w600),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                title,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            if (platform != null) ...[
              Icon(Icons.public, size: 12, color: palette.textWeak),
              const SizedBox(width: 4),
              Text(platform, style: TextStyle(fontSize: 12, color: palette.textWeak)),
              const SizedBox(width: 12),
            ],
            if (rewardMin != null || rewardMax != null) ...[
              Icon(Icons.attach_money, size: 12, color: palette.textWeak),
              Text(
                '${rewardMin ?? '?'} – ${rewardMax ?? '?'} $currency',
                style: TextStyle(fontSize: 12, color: palette.textWeak),
              ),
            ],
            const Spacer(),
            Text(
              score.toStringAsFixed(0),
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: scoreColor),
            ),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: score / 100.0,
            backgroundColor: palette.backgroundWeak,
            color: scoreColor,
            minHeight: 4,
          ),
        ),
        if (showActions) ...[
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            children: [
              OpenCodeButton(
                onPressed: () => _shortlist(id),
                variant: OpenCodeButtonVariant.primary,
                size: OpenCodeButtonSize.small,
                icon: Icons.star_outline,
                child: const Text('Shortlist'),
              ),
              OpenCodeButton(
                onPressed: () => _ignore(id),
                variant: OpenCodeButtonVariant.secondary,
                size: OpenCodeButtonSize.small,
                child: const Text('Ignore'),
              ),
            ],
          ),
        ],
        if (showExecute) ...[
          const SizedBox(height: 10),
          OpenCodeButton(
            onPressed: () => _execute(id, title),
            variant: OpenCodeButtonVariant.primary,
            size: OpenCodeButtonSize.small,
            icon: Icons.rocket_launch_outlined,
            child: const Text('Launch Dev Cycle'),
          ),
        ],
      ],
    );

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: column,
      ),
    );
  }
}

/// Subtle grid for featured opportunity hero (no external image).
class _GridGlowPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = KineticTokens.primaryContainer.withValues(alpha: 0.06)
      ..strokeWidth = 1;
    const step = 24.0;
    for (double x = 0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), p);
    }
    for (double y = 0; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), p);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
