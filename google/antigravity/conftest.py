# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Pytest configuration shared by all tests in this package."""

from absl import flags


def pytest_configure(config):  # pylint: disable=unused-argument
  """Parses absl flags so absltest helpers work under pytest.

  Tests built on `absltest.TestCase` use helpers such as `create_tempdir()`
  that read `--test_tmpdir`. absl only parses flags when a test file is run via
  `absltest.main()`, so without this they raise `UnparsedFlagAccessError` when
  collected by pytest.
  """
  if not flags.FLAGS.is_parsed():
    flags.FLAGS(["pytest"])
