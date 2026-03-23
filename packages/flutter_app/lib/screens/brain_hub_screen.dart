import 'package:flutter/material.dart';

import 'discovery_screen.dart';
import 'learnings_screen.dart';
import 'memory_search_screen.dart';

/// Hub screen for the Brain tab — sub-tabs: Learnings | Memory | Discovery.
class BrainHubScreen extends StatelessWidget {
  const BrainHubScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Column(
        children: [
          TabBar(
            tabs: const [
              Tab(text: 'Learnings'),
              Tab(text: 'Memória'),
              Tab(text: 'Discovery'),
            ],
            labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            unselectedLabelStyle: const TextStyle(fontSize: 13),
            indicatorSize: TabBarIndicatorSize.tab,
          ),
          const Expanded(
            child: TabBarView(
              children: [
                LearningsScreen(),
                MemorySearchScreen(),
                DiscoveryScreen(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
