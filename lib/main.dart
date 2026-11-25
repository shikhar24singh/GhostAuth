import 'package:flutter/widgets.dart';

import 'app.dart';
import 'platform.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const GhostAuthApp(platform: AndroidPlatform()));
}
