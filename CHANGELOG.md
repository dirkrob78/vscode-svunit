# Change Log

## [0.0.11]
- Revert to using shell in child_process() instead of running in terminals, for reliability

## [0.0.9]

### Added
- Workspace-level test items for better organization in multi-root workspaces
- Per-folder terminal execution - each test directory gets its own dedicated terminal

### Changed
- Test execution now runs in visible terminals instead of hidden background processes
- Terminal sessions are persistent per test folder with one-time setup
- Always include `-t` flags for explicit file selection in test commands

### Fixed
- Create test item for folder a/b/c instead of one for each folder level

## [0.0.8]

### Added
- Multi-root workspace support - discover and run tests across multiple workspace folders

## [0.0.6] - Previous Release

### Initial Features
- Basic SVUnit test discovery and execution
- Test explorer integration
- Single workspace support
- Test file parsing and hierarchy
- Configuration for simulator and run commands
- Setup command support
